/*
 * Copyright 2024 The Backstage Authors
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
import { overrideTargetPaths } from '@backstage/cli-common/testUtils';
import {
  detectPackageManager,
  resetDetectedPackageManagers,
} from './PackageManager';
import { Yarn } from './yarn';
import { withLogCollector } from '@backstage/test-utils';

const mockDir = createMockDirectory();
overrideTargetPaths(mockDir.path);

const mockYarnCreate = jest.spyOn(Yarn, 'create');

const PNPM_LOG = 'Detected unsupported package manager: pnpm.';
const FALLBACK_LOG =
  'Yarn was not detected, but is the only supported package manager.';

describe('detectPackageManager', () => {
  let mockYarn: Yarn;

  beforeEach(() => {
    mockYarn = { name: () => 'yarn' } as unknown as Yarn;
    mockYarnCreate.mockResolvedValue(mockYarn);
  });

  afterEach(() => {
    jest.resetAllMocks();
    resetDetectedPackageManagers();
  });

  async function detect() {
    let pm: Awaited<ReturnType<typeof detectPackageManager>> | undefined;
    const { warn: log } = await withLogCollector(async () => {
      pm = await detectPackageManager();
    });
    return { pm, log };
  }

  it('should let a declared package manager win over the lockfiles', async () => {
    // A yarn.lock left behind by a migration does not make this a Yarn project
    mockDir.setContent({
      'pnpm-lock.yaml': 'just needs to exist',
      'yarn.lock': 'just needs to exist',
      'package.json': JSON.stringify({
        name: 'foo',
        packageManager: 'yarn@4.0.0',
        workspaces: ['packages/*'],
      }),
    });
    await expect(detect()).resolves.toEqual({ pm: mockYarn, log: [] });
    resetDetectedPackageManagers();

    mockDir.setContent({
      'yarn.lock': 'just needs to exist',
      'package.json': JSON.stringify({
        name: 'foo',
        packageManager: 'pnpm@12.4.0',
      }),
    });
    // pnpm is not supported yet, so we fall back to yarn with a warning
    await expect(detect()).resolves.toEqual({ pm: mockYarn, log: [PNPM_LOG] });

    expect(mockYarnCreate).toHaveBeenCalledTimes(2);
  });

  it('should detect from the lockfiles, and warn when both exist', async () => {
    mockDir.setContent({
      'yarn.lock': 'just needs to exist',
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': JSON.stringify({ name: 'foo' }),
    });
    await expect(detect()).resolves.toEqual({ pm: mockYarn, log: [] });
    resetDetectedPackageManagers();

    mockDir.setContent({
      'pnpm-lock.yaml': 'just needs to exist',
      'yarn.lock': 'just needs to exist',
      'package.json': JSON.stringify({ name: 'foo' }),
    });
    const { pm, log } = await detect();
    expect(pm).toBe(mockYarn);
    expect(log).toEqual([
      expect.stringContaining('Both pnpm-lock.yaml and yarn.lock exist'),
      PNPM_LOG,
    ]);

    expect(mockYarnCreate).toHaveBeenCalledTimes(2);
  });

  it('should ignore an unsupported declaration when the project shows what it uses', async () => {
    mockDir.setContent({
      'yarn.lock': 'just needs to exist',
      'package.json': JSON.stringify({
        name: 'foo',
        packageManager: 'npm@10.0.0',
      }),
    });

    const { pm, log } = await detect();
    expect(pm).toBe(mockYarn);
    expect(log).toEqual([
      expect.stringContaining(
        'declares npm, which is not supported. Detecting from the project files instead.',
      ),
    ]);
    expect(mockYarnCreate).toHaveBeenCalledTimes(1);
  });

  it('should fail when an unsupported declaration is the only signal', async () => {
    mockDir.setContent({
      'package.json': JSON.stringify({
        name: 'foo',
        packageManager: 'npm@10.0.0',
      }),
    });

    await expect(detectPackageManager()).rejects.toThrow(
      'The packageManager field of the project declares npm, which is not supported. Use yarn or pnpm, or remove the field',
    );
    expect(mockYarnCreate).not.toHaveBeenCalled();
  });

  it('should detect via the packageManager field before workspace config', async () => {
    mockDir.setContent({
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': JSON.stringify({
        name: 'foo',
        packageManager: 'yarn@4.0.0',
        workspaces: ['packages/*'],
      }),
    });
    await expect(detect()).resolves.toEqual({ pm: mockYarn, log: [] });
    resetDetectedPackageManagers();

    mockDir.setContent({
      'package.json': JSON.stringify({
        name: 'foo',
        packageManager: 'pnpm@12.4.0',
        workspaces: ['packages/*'],
      }),
    });
    await expect(detect()).resolves.toEqual({ pm: mockYarn, log: [PNPM_LOG] });
    resetDetectedPackageManagers();

    expect(mockYarnCreate).toHaveBeenCalledTimes(2);
  });

  it('should detect pnpm via pnpm-workspace.yaml before the workspaces field', async () => {
    mockDir.setContent({
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': JSON.stringify({
        name: 'foo',
        workspaces: ['packages/*'],
      }),
    });

    await expect(detect()).resolves.toEqual({ pm: mockYarn, log: [PNPM_LOG] });
    expect(mockYarnCreate).toHaveBeenCalledTimes(1);
  });

  it('should detect yarn via root package.json workspaces', async () => {
    mockDir.setContent({
      'package.json': JSON.stringify({
        name: 'foo',
        workspaces: {
          packages: [],
        },
      }),
    });
    await expect(detect()).resolves.toEqual({ pm: mockYarn, log: [] });
    resetDetectedPackageManagers();

    mockDir.setContent({
      'package.json': JSON.stringify({
        name: 'foo',
        workspaces: ['packages/*'],
      }),
    });
    await expect(detect()).resolves.toEqual({ pm: mockYarn, log: [] });

    expect(mockYarnCreate).toHaveBeenCalledTimes(2);
  });

  it('should fall back to yarn with a warning', async () => {
    mockDir.setContent({
      'package.json': JSON.stringify({
        name: 'foo',
      }),
    });
    await expect(detect()).resolves.toEqual({
      pm: mockYarn,
      log: [FALLBACK_LOG],
    });
    resetDetectedPackageManagers();

    mockDir.setContent({});
    const { pm, log } = await detect();
    expect(pm).toBe(mockYarn);
    // extra log for the error reading package.json
    expect(log).toEqual([
      expect.stringContaining('Error during package manager detection'),
      FALLBACK_LOG,
    ]);

    expect(mockYarnCreate).toHaveBeenCalledTimes(2);
  });

  it('should cache the result per project root', async () => {
    mockDir.setContent({
      'yarn.lock': 'just needs to exist',
    });

    await expect(detectPackageManager()).resolves.toBe(mockYarn);
    await expect(detectPackageManager()).resolves.toBe(mockYarn);
    expect(mockYarnCreate).toHaveBeenCalledTimes(1);

    resetDetectedPackageManagers();
    await expect(detectPackageManager()).resolves.toBe(mockYarn);
    expect(mockYarnCreate).toHaveBeenCalledTimes(2);
  });

  it('should not cache a failed detection', async () => {
    mockDir.setContent({
      'yarn.lock': 'just needs to exist',
    });

    mockYarnCreate.mockRejectedValueOnce(new Error('NOPE'));
    await expect(detectPackageManager()).rejects.toThrow('NOPE');
    await expect(detectPackageManager()).resolves.toBe(mockYarn);
    expect(mockYarnCreate).toHaveBeenCalledTimes(2);
  });
});
