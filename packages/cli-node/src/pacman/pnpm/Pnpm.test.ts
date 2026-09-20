/*
 * Copyright 2026 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createMockDirectory } from '@backstage/backend-test-utils';
import { run, runOutput } from '@backstage/cli-common';
import { overrideTargetPaths } from '@backstage/cli-common/testUtils';
import { NotFoundError } from '@backstage/errors';
import { Pnpm } from './Pnpm';
import { PnpmLockfile } from './PnpmLockfile';

jest.mock('@backstage/cli-common', () => {
  const actual = jest.requireActual('@backstage/cli-common');
  return {
    ...actual,
    run: jest.fn(),
    runOutput: jest.fn(),
  };
});

const mockRun = jest.mocked(run);
const mockRunOutput = jest.mocked(runOutput);

const mockDir = createMockDirectory();
overrideTargetPaths(mockDir.path);

const mockLockfile = `
lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      a:
        specifier: ^1
        version: 1.0.0

packages:

  a@1.0.0:
    resolution: {integrity: sha512-abc}

snapshots:

  a@1.0.0: {}
`;

describe('Pnpm', () => {
  let pnpm: Pnpm;

  beforeAll(async () => {
    mockRunOutput.mockResolvedValueOnce('12.4.2\n');
    pnpm = await Pnpm.create('/project');
  });

  beforeEach(() => {
    mockRun.mockReturnValue({
      waitForExit: async () => {},
    } as unknown as ReturnType<typeof run>);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should detect the pnpm version on creation', () => {
    expect(mockRunOutput).toHaveBeenCalledWith(['pnpm', '--version'], {
      cwd: '/project',
    });

    expect(pnpm.name()).toBe('pnpm');
    expect(pnpm.version()).toBe('12.4.2');
    expect(pnpm.lockfileName()).toBe('pnpm-lock.yaml');
    expect(pnpm.toString()).toBe('pnpm@12.4.2');
  });

  it('should require pnpm 12.4 or later', async () => {
    mockRunOutput.mockResolvedValueOnce('10.2.0\n');
    await expect(Pnpm.create('/old')).rejects.toThrow(
      'pnpm 12.4 or later is required, found 10.2.0',
    );

    mockRunOutput.mockResolvedValueOnce('12.3.9\n');
    await expect(Pnpm.create('/older')).rejects.toThrow(
      'pnpm 12.4 or later is required, found 12.3.9',
    );

    mockRunOutput.mockResolvedValueOnce('13.0.0\n');
    await expect(Pnpm.create('/newer')).resolves.toBeInstanceOf(Pnpm);

    mockRunOutput.mockResolvedValueOnce('not a version\n');
    await expect(Pnpm.create('/broken')).rejects.toThrow(
      'Failed to determine pnpm version',
    );

    mockRunOutput.mockRejectedValueOnce(new Error('spawn pnpm ENOENT'));
    await expect(Pnpm.create('/missing')).rejects.toThrow(
      'Failed to determine pnpm version; caused by Error: spawn pnpm ENOENT',
    );

    // The version detection is cached per directory
    await expect(Pnpm.create('/newer')).resolves.toBeInstanceOf(Pnpm);
    expect(mockRunOutput).toHaveBeenCalledTimes(5);

    // A failed version check is not cached
    mockRunOutput.mockResolvedValueOnce('12.4.2\n');
    await expect(Pnpm.create('/missing')).resolves.toBeInstanceOf(Pnpm);
    expect(mockRunOutput).toHaveBeenCalledTimes(6);
  });

  it('should run commands and scripts', async () => {
    await pnpm.run(['--version'], { cwd: '/foo' });
    expect(mockRun).toHaveBeenLastCalledWith(['pnpm', '--version'], {
      cwd: '/foo',
    });

    await pnpm.runScript('lint');
    expect(mockRun).toHaveBeenLastCalledWith(
      ['pnpm', 'run', 'lint'],
      undefined,
    );

    await pnpm.runScript('lint', ['--fix'], { cwd: '/foo' });
    expect(mockRun).toHaveBeenLastCalledWith(['pnpm', 'run', 'lint', '--fix'], {
      cwd: '/foo',
    });

    await pnpm.runWorkspaceScript('backend', 'start');
    expect(mockRun).toHaveBeenLastCalledWith(
      ['pnpm', '--filter', 'backend', 'run', 'start'],
      undefined,
    );

    await pnpm.runWorkspaceScript('backend', 'start', ['--inspect'], {
      cwd: '/foo',
    });
    expect(mockRun).toHaveBeenLastCalledWith(
      ['pnpm', '--filter', 'backend', 'run', 'start', '--inspect'],
      { cwd: '/foo' },
    );

    expect(pnpm.getCommandHint(['fix', '--publish'])).toBe(
      'pnpm fix --publish',
    );
    expect(pnpm.getCommandHint(['install'])).toBe('pnpm install');
  });

  it('should install dependencies', async () => {
    await pnpm.install();
    expect(mockRun).toHaveBeenLastCalledWith(['pnpm', 'install'], {
      cwd: undefined,
      env: undefined,
      onStdout: undefined,
      onStderr: undefined,
    });

    await pnpm.install({ immutable: true });
    expect(mockRun).toHaveBeenLastCalledWith(
      ['pnpm', 'install', '--frozen-lockfile'],
      expect.anything(),
    );

    const onStdout = jest.fn();
    const onStderr = jest.fn();
    await pnpm.install({
      immutable: false,
      cwd: '/foo',
      env: { FORCE_COLOR: 'true' },
      onStdout,
      onStderr,
    });
    expect(mockRun).toHaveBeenLastCalledWith(
      ['pnpm', 'install', '--no-frozen-lockfile'],
      {
        cwd: '/foo',
        env: { FORCE_COLOR: 'true' },
        onStdout,
        onStderr,
      },
    );
  });

  it('should pack packages', async () => {
    await pnpm.pack('/out/pkg.tgz', '/pkg');
    expect(mockRun).toHaveBeenLastCalledWith(
      ['pnpm', 'pack', '--out', '/out/pkg.tgz'],
      { cwd: '/pkg' },
    );

    const onStdout = () => {};
    await pnpm.pack('/out/pkg.tgz', '/pkg', { cwd: '/ignored', onStdout });
    expect(mockRun).toHaveBeenLastCalledWith(
      ['pnpm', 'pack', '--out', '/out/pkg.tgz'],
      { cwd: '/pkg', onStdout },
    );
  });

  it('should fetch package info', async () => {
    mockRunOutput.mockResolvedValueOnce(
      JSON.stringify({
        name: 'my-package',
        version: '1.1.0',
        'dist-tags': { latest: '1.1.0' },
        versions: ['1.0.0', '1.1.0'],
        time: { '1.0.0': '2026-01-01T00:00:00.000Z' },
        maintainers: [{ name: 'someone' }],
      }),
    );
    await expect(pnpm.fetchPackageInfo('my-package')).resolves.toEqual({
      name: 'my-package',
      'dist-tags': { latest: '1.1.0' },
      versions: ['1.0.0', '1.1.0'],
      time: { '1.0.0': '2026-01-01T00:00:00.000Z' },
    });
    expect(mockRunOutput).toHaveBeenLastCalledWith([
      'pnpm',
      'view',
      'my-package',
      '--json',
    ]);

    // pnpm exits with a non-zero code and writes the error as JSON to stdout
    const notFound = new Error('Command failed');
    (notFound as Error & { stdout?: string }).stdout = JSON.stringify({
      error: {
        code: 'ERR_PNPM_FETCH_404',
        message: 'GET https://registry.npmjs.org/my-package: Not Found - 404',
      },
    });
    mockRunOutput.mockRejectedValueOnce(notFound);
    await expect(pnpm.fetchPackageInfo('my-package')).rejects.toThrow(
      new NotFoundError(`No package information found for package my-package`),
    );

    mockRunOutput.mockResolvedValueOnce(
      JSON.stringify({ error: { code: 'ERR_PNPM_FETCH_404' } }),
    );
    await expect(pnpm.fetchPackageInfo('my-package')).rejects.toThrow(
      new NotFoundError(`No package information found for package my-package`),
    );

    mockRunOutput.mockResolvedValueOnce(
      JSON.stringify({ error: { code: 'ERR_PNPM_OTHER', message: 'nope' } }),
    );
    await expect(pnpm.fetchPackageInfo('my-package')).rejects.toThrow(
      'Failed to fetch package information for my-package, nope',
    );

    mockRunOutput.mockResolvedValueOnce('');
    await expect(pnpm.fetchPackageInfo('my-package')).rejects.toThrow(
      new NotFoundError(`No package information found for package my-package`),
    );

    mockRunOutput.mockRejectedValueOnce(new Error('Command failed'));
    await expect(pnpm.fetchPackageInfo('my-package')).rejects.toThrow(
      'Command failed',
    );
  });

  it('should load and parse lockfiles', async () => {
    mockDir.setContent({
      'pnpm-lock.yaml': mockLockfile,
      'package.json': JSON.stringify({ name: 'root' }),
    });

    const loaded = await pnpm.loadLockfile();
    expect(loaded).toBeInstanceOf(PnpmLockfile);
    expect(loaded.get('a')).toEqual([{ range: '^1', version: '1.0.0' }]);
    expect([...loaded.keys()]).toEqual(['a', 'root']);

    const parsed = await pnpm.parseLockfile(mockLockfile);
    expect(parsed).toBeInstanceOf(PnpmLockfile);
    expect(parsed.get('a')).toEqual([{ range: '^1', version: '1.0.0' }]);
    expect([...parsed.keys()]).toEqual(['a', 'root']);
  });

  it('should not support the backstage version protocol', async () => {
    await expect(pnpm.supportsBackstageVersionProtocol()).resolves.toBe(false);
  });
});
