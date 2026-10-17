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
import { NotFoundError } from '@backstage/errors';
import { Pnpm } from './Pnpm';
import { PnpmLockfile } from './PnpmLockfile';

jest.mock('@backstage/cli-common', () => ({
  ...jest.requireActual('@backstage/cli-common'),
  run: jest.fn(),
  runOutput: jest.fn(),
}));

const mockRun = jest.mocked(run);
const mockRunOutput = jest.mocked(runOutput);

const mockDir = createMockDirectory();

const mockLockfile = `
lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      a:
        specifier: ^1
        version: 1.0.0

  packages/b:
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

  // The pnpm lockfile libraries are ES modules, which are slow to load the
  // first time in tests
  beforeAll(async () => {
    await import('@pnpm/lockfile.fs');
    await import('@pnpm/deps.path');
  }, 60_000);

  beforeAll(async () => {
    mockRunOutput.mockResolvedValueOnce('12.7.0\n');
    pnpm = await Pnpm.create({ workspaceRootDir: '/project' });
  });

  beforeEach(() => {
    mockRun.mockReturnValue({
      waitForExit: async () => {},
    } as unknown as ReturnType<typeof run>);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should detect the pnpm version in the workspace root and require 12.7', async () => {
    expect(mockRunOutput).toHaveBeenCalledWith(['pnpm', '--version'], {
      cwd: '/project',
    });
    expect(pnpm.name()).toBe('pnpm');
    expect(pnpm.version()).toBe('12.7.0');
    expect(pnpm.lockfileName()).toBe('pnpm-lock.yaml');
    expect(pnpm.toString()).toBe('pnpm@12.7.0');
    await expect(pnpm.supportsBackstageVersionProtocol()).resolves.toBe(false);
    expect(pnpm.getCommandHint(['backstage-cli', 'repo', 'fix'])).toBe(
      'pnpm backstage-cli repo fix',
    );

    mockRunOutput.mockResolvedValueOnce('12.6.0\n');
    await expect(Pnpm.create({ workspaceRootDir: '/old' })).rejects.toThrow(
      'pnpm 12.7 or later is required, found 12.6.0',
    );

    // A failed version check is not cached
    mockRunOutput.mockRejectedValueOnce(new Error('command not found'));
    await expect(Pnpm.create({ workspaceRootDir: '/flaky' })).rejects.toThrow(
      'Failed to determine pnpm version',
    );
    mockRunOutput.mockResolvedValueOnce('12.14.0\n');
    await expect(
      Pnpm.create({ workspaceRootDir: '/flaky' }),
    ).resolves.toBeInstanceOf(Pnpm);
  });

  it('should run commands and scripts in the workspace root by default', async () => {
    await pnpm.run(['--version']);
    expect(mockRun).toHaveBeenLastCalledWith(['pnpm', '--version'], {
      cwd: '/project',
    });

    await pnpm.runScript('lint', ['--fix'], { cwd: '/project/packages/a' });
    expect(mockRun).toHaveBeenLastCalledWith(['pnpm', 'run', 'lint', '--fix'], {
      cwd: '/project/packages/a',
    });

    await pnpm.runWorkspaceScript('backend', 'start', ['--inspect']);
    expect(mockRun).toHaveBeenLastCalledWith(
      ['pnpm', '--filter', 'backend', 'run', 'start', '--inspect'],
      { cwd: '/project' },
    );

    const onStdout = jest.fn();
    await pnpm.pack('/out/pkg.tgz', '/pkg', { cwd: '/other', onStdout });
    expect(mockRun).toHaveBeenLastCalledWith(
      ['pnpm', 'pack', '--out', '/out/pkg.tgz'],
      { cwd: '/pkg', onStdout },
    );
  });

  it('should install dependencies in the workspace root', async () => {
    const npmConfigVar = 'npm_config_backstage_pnpm_test';
    const originalValue = process.env[npmConfigVar];
    process.env[npmConfigVar] = 'value';

    try {
      await pnpm.install();
      expect(mockRun).toHaveBeenLastCalledWith(['pnpm', 'install'], {
        cwd: '/project',
        env: expect.objectContaining({
          PATH: process.env.PATH,
          [npmConfigVar]: undefined,
        }),
        onStdout: undefined,
        onStderr: undefined,
      });

      await pnpm.install({ immutable: true, offline: true });
      expect(mockRun).toHaveBeenLastCalledWith(
        ['pnpm', 'install', '--frozen-lockfile', '--offline'],
        expect.objectContaining({ cwd: '/project' }),
      );

      const onStdout = jest.fn();
      const onStderr = jest.fn();
      await pnpm.install({
        immutable: false,
        filter: ['app', 'backend'],
        env: { FORCE_COLOR: 'true' },
        onStdout,
        onStderr,
      });
      expect(mockRun).toHaveBeenLastCalledWith(
        [
          'pnpm',
          'install',
          '--no-frozen-lockfile',
          '--filter',
          'app...',
          '--filter',
          'backend...',
        ],
        {
          cwd: '/project',
          env: expect.objectContaining({ FORCE_COLOR: 'true' }),
          onStdout,
          onStderr,
        },
      );
    } finally {
      if (originalValue === undefined) {
        delete process.env[npmConfigVar];
      } else {
        process.env[npmConfigVar] = originalValue;
      }
    }
  });

  it('should fetch package info with pnpm view', async () => {
    mockRunOutput.mockResolvedValueOnce(
      JSON.stringify({
        name: 'my-package',
        'dist-tags': { latest: '1.0.0' },
        versions: ['1.0.0'],
        time: { '1.0.0': '2026-01-01T00:00:00.000Z' },
        description: 'not part of the result',
      }),
    );
    await expect(pnpm.fetchPackageInfo('my-package')).resolves.toEqual({
      name: 'my-package',
      'dist-tags': { latest: '1.0.0' },
      versions: ['1.0.0'],
      time: { '1.0.0': '2026-01-01T00:00:00.000Z' },
    });
    expect(mockRunOutput).toHaveBeenLastCalledWith(
      ['pnpm', 'view', 'my-package', '--json'],
      { cwd: '/project' },
    );

    // pnpm exits with an error and prints the error as JSON for a missing package
    const notFound = new Error('Command failed');
    (notFound as Error & { stdout?: string }).stdout = JSON.stringify({
      error: { code: 'ERR_PNPM_FETCH_404', message: 'Not Found - 404' },
    });
    mockRunOutput.mockRejectedValueOnce(notFound);
    await expect(pnpm.fetchPackageInfo('my-package')).rejects.toThrow(
      new NotFoundError(`No package information found for package my-package`),
    );

    mockRunOutput.mockResolvedValueOnce('');
    await expect(pnpm.fetchPackageInfo('my-package')).rejects.toThrow(
      NotFoundError,
    );

    mockRunOutput.mockResolvedValueOnce(
      JSON.stringify({ error: { code: 'ERR_PNPM_X', message: 'Nope' } }),
    );
    await expect(pnpm.fetchPackageInfo('my-package')).rejects.toThrow(
      'Failed to fetch package information for my-package, Nope',
    );

    mockRunOutput.mockRejectedValueOnce(new Error('Command failed'));
    await expect(pnpm.fetchPackageInfo('my-package')).rejects.toThrow(
      'Command failed',
    );
  });

  it('should read and update catalogs in pnpm-workspace.yaml', async () => {
    mockRunOutput.mockResolvedValueOnce('12.7.0\n');
    const local = await Pnpm.create({ workspaceRootDir: mockDir.path });

    mockDir.setContent({});
    await expect(local.readCatalogs()).resolves.toEqual({});
    await expect(local.updateCatalog('default', {})).rejects.toThrow(
      "The catalog 'default' does not exist in pnpm-workspace.yaml",
    );

    mockDir.setContent({
      'pnpm-workspace.yaml': `packages:
  - packages/*

# The main line
catalog:
  '@backstage/core': ^1.0.0 # keep this
  react: ^18.0.0

catalogs:
  backstage-next:
    '@backstage/core': ^1.1.0-next.0
`,
    });
    await expect(local.readCatalogs()).resolves.toEqual({
      default: { '@backstage/core': '^1.0.0', react: '^18.0.0' },
      'backstage-next': { '@backstage/core': '^1.1.0-next.0' },
    });

    await local.updateCatalog('default', { '@backstage/core': '^1.2.0' });
    await local.updateCatalog('backstage-next', {
      '@backstage/core': '^1.3.0-next.1',
    });
    await expect(local.updateCatalog('nope', {})).rejects.toThrow(
      "The catalog 'nope' does not exist in pnpm-workspace.yaml",
    );

    // Comments and formatting are kept
    expect(mockDir.content()).toEqual({
      'pnpm-workspace.yaml': `packages:
  - packages/*

# The main line
catalog:
  '@backstage/core': ^1.2.0 # keep this
  react: ^18.0.0

catalogs:
  backstage-next:
    '@backstage/core': ^1.3.0-next.1
`,
    });
  });

  it('should load the lockfile and name workspace packages from the workspace root', async () => {
    mockDir.setContent({
      'pnpm-lock.yaml': mockLockfile,
      'package.json': JSON.stringify({ name: 'root' }),
      packages: { b: { 'package.json': JSON.stringify({ name: 'b' }) } },
    });
    mockRunOutput.mockResolvedValueOnce('12.7.0\n');
    const local = await Pnpm.create({ workspaceRootDir: mockDir.path });

    const loaded = await local.loadLockfile();
    expect(loaded).toBeInstanceOf(PnpmLockfile);
    expect([...loaded.keys()].sort()).toEqual(['a', 'b', 'root']);
    expect(loaded.get('a')).toEqual([{ range: '^1', version: '1.0.0' }]);
    expect(loaded.get('b')).toEqual([
      { range: 'workspace:packages/b', version: 'link:packages/b' },
    ]);

    // Without a way to read the workspace packages they can't be named
    const parsed = await local.parseLockfile(mockLockfile);
    expect([...parsed.keys()].sort()).toEqual(['.', 'a', 'packages/b']);
    expect(() => parsed.diff(loaded)).toThrow(
      'The workspace packages in pnpm-lock.yaml could not be named',
    );

    const named = await local.parseLockfile(mockLockfile, {
      readWorkspacePackageJson: async dir => ({
        name: dir === '.' ? 'root' : 'b',
      }),
    });
    expect(named.diff(loaded)).toEqual({ added: [], changed: [], removed: [] });
  });
});
