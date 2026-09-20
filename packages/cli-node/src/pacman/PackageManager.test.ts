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
import { Pnpm } from './pnpm';
import { withLogCollector } from '@backstage/test-utils';

const mockDir = createMockDirectory();
overrideTargetPaths(mockDir.path);

const mockYarnCreate = jest.spyOn(Yarn, 'create');
const mockPnpmCreate = jest.spyOn(Pnpm, 'create');

const FALLBACK_LOG = 'No package manager was detected, falling back to yarn.';

describe('detectPackageManager', () => {
  let mockYarn: Yarn;
  let mockPnpm: Pnpm;

  beforeEach(() => {
    mockYarn = { name: () => 'yarn' } as unknown as Yarn;
    mockYarnCreate.mockResolvedValue(mockYarn);
    mockPnpm = { name: () => 'pnpm' } as unknown as Pnpm;
    mockPnpmCreate.mockResolvedValue(mockPnpm);
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
    expect(mockYarnCreate).toHaveBeenCalledWith(mockDir.path);
    expect(mockPnpmCreate).not.toHaveBeenCalled();
    resetDetectedPackageManagers();

    mockDir.setContent({
      'yarn.lock': 'just needs to exist',
      'package.json': JSON.stringify({
        name: 'foo',
        packageManager: 'pnpm@12.4.0',
      }),
    });
    await expect(detect()).resolves.toEqual({ pm: mockPnpm, log: [] });
    expect(mockPnpmCreate).toHaveBeenCalledWith(mockDir.path);
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
    expect(pm).toBe(mockPnpm);
    expect(log).toEqual([
      expect.stringContaining('Both pnpm-lock.yaml and yarn.lock exist'),
    ]);
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
    expect(mockPnpmCreate).not.toHaveBeenCalled();
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
    await expect(detect()).resolves.toEqual({ pm: mockPnpm, log: [] });
    resetDetectedPackageManagers();

    expect(mockYarnCreate).toHaveBeenCalledTimes(1);
    expect(mockPnpmCreate).toHaveBeenCalledTimes(1);
  });

  it('should detect pnpm via pnpm-workspace.yaml before the workspaces field', async () => {
    mockDir.setContent({
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': JSON.stringify({
        name: 'foo',
        workspaces: ['packages/*'],
      }),
    });

    await expect(detect()).resolves.toEqual({ pm: mockPnpm, log: [] });
    expect(mockPnpmCreate).toHaveBeenCalledTimes(1);
    expect(mockYarnCreate).not.toHaveBeenCalled();
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

    resetDetectedPackageManagers();
    mockDir.setContent({
      'pnpm-lock.yaml': 'just needs to exist',
    });

    mockPnpmCreate.mockRejectedValueOnce(
      new Error('pnpm 12.4 or later is required, found 10.2.0'),
    );
    await expect(detectPackageManager()).rejects.toThrow(
      'pnpm 12.4 or later is required, found 10.2.0',
    );
    await expect(detectPackageManager()).resolves.toBe(mockPnpm);
    expect(mockPnpmCreate).toHaveBeenCalledTimes(2);
  });
});
