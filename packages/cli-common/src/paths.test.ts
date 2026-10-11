/*
 * Copyright 2020 The Backstage Authors
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

/* eslint-disable no-restricted-syntax */
import fs from 'node:fs';
import os from 'node:os';
import { dirname, resolve as resolvePath } from 'node:path';
import {
  findPaths,
  findRootPath,
  findOwnRootDir,
  findOwnPaths,
  targetPaths,
} from './paths';
import { overrideTargetPaths } from './testUtils';

describe('paths', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('findOwnPaths and findOwnRootDir should find own paths', () => {
    const own = findOwnPaths(__dirname);
    const root = findOwnRootDir(own.dir);

    expect(own.dir).toBe(resolvePath(__dirname, '..'));
    expect(root).toBe(resolvePath(__dirname, '../../..'));
  });

  it('findRootPath should find a root path', () => {
    expect(findRootPath(__dirname, () => true)).toBe(
      resolvePath(__dirname, '..'),
    );

    expect(findRootPath(__dirname, () => false)).toBeUndefined();

    expect(
      findRootPath(
        __dirname,
        path => path !== resolvePath(__dirname, '../package.json'),
      ),
    ).toBe(resolvePath(__dirname, '../../..'));
  });

  it('findPaths should find package paths', () => {
    const dir = resolvePath(__dirname, '..');
    const root = resolvePath(__dirname, '../../..');

    jest.spyOn(process, 'cwd').mockReturnValue(dir);

    const paths = findPaths(__dirname);

    expect(paths.ownDir).toBe(dir);
    expect(paths.ownRoot).toBe(root);
    expect(paths.resolveOwn('./derp.txt')).toBe(resolvePath(dir, 'derp.txt'));
    expect(paths.resolveOwnRoot('./derp.txt')).toBe(
      resolvePath(root, 'derp.txt'),
    );
    expect(paths.targetDir).toBe(dir);
    expect(paths.targetRoot).toBe(root);
    expect(paths.resolveTarget('./derp.txt')).toBe(
      resolvePath(dir, 'derp.txt'),
    );
    expect(paths.resolveTargetRoot('./derp.txt')).toBe(
      resolvePath(root, 'derp.txt'),
    );
  });

  it('findPaths should find mocked package paths', () => {
    const mockCwd = resolvePath(__dirname, '../../config');
    const mockDir = resolvePath(__dirname, '../../cli');
    const root = resolvePath(__dirname, '../../..');

    jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);

    const paths = findPaths(resolvePath(mockDir, 'src/lib'));

    expect(paths.ownDir).toBe(mockDir);
    expect(paths.ownRoot).toBe(root);
    expect(paths.resolveOwn('./derp.txt')).toBe(
      resolvePath(mockDir, 'derp.txt'),
    );
    expect(paths.resolveOwnRoot('./derp.txt')).toBe(
      resolvePath(root, 'derp.txt'),
    );
    expect(paths.targetDir).toBe(mockCwd);
    expect(paths.targetRoot).toBe(root);
    expect(paths.resolveTarget('./derp.txt')).toBe(
      resolvePath(mockCwd, 'derp.txt'),
    );
    expect(paths.resolveTargetRoot('./derp.txt')).toBe(
      resolvePath(root, 'derp.txt'),
    );
  });

  it('findPaths should find workspace root with object', () => {
    jest
      .spyOn(JSON, 'parse')
      .mockReturnValue({ workspaces: { packages: ['packages/*'] } });
    jest.spyOn(process, 'cwd').mockReturnValue(__dirname);

    const paths = findPaths(__dirname);

    expect(paths.targetDir).toBe(
      resolvePath(__dirname, '../../cli-common/src'),
    );
    expect(paths.targetRoot).toBe(resolvePath(__dirname, '../../cli-common'));
  });

  it('findPaths should find workspace root with array', () => {
    jest.spyOn(JSON, 'parse').mockReturnValue({ workspaces: ['packages/*'] });
    jest.spyOn(process, 'cwd').mockReturnValue(__dirname);

    const paths = findPaths(__dirname);

    expect(paths.targetDir).toBe(
      resolvePath(__dirname, '../../cli-common/src'),
    );
    expect(paths.targetRoot).toBe(resolvePath(__dirname, '../../cli-common'));
  });
});

describe('targetPaths', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(resolvePath(os.tmpdir(), 'cli-common-paths-')),
    );
    const files: Record<string, string> = {
      // A pnpm workspace with a Backstage installation in a subdirectory
      'pnpm/package.json': '{}',
      'pnpm/pnpm-workspace.yaml': 'packages:\n  - apps/**\n  - libs/*\n',
      'pnpm/apps/backstage/backstage.json': '{}',
      'pnpm/apps/backstage/package.json': '{}',
      'pnpm/apps/backstage/packages/backend/package.json': '{}',
      'pnpm/libs/other/package.json': '{}',
      // A Yarn workspace with the Backstage installation at the root
      'yarn/package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'yarn/backstage.json': '{}',
      'yarn/packages/app/package.json': '{}',
      // A package that is not part of any workspace
      'standalone/package.json': '{}',
    };
    for (const [path, content] of Object.entries(files)) {
      fs.mkdirSync(dirname(resolvePath(tmpDir, path)), { recursive: true });
      fs.writeFileSync(resolvePath(tmpDir, path), content);
    }
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('finds the workspace and installation roots and re-resolves them when the working directory changes', () => {
    const cwd = jest.spyOn(process, 'cwd');

    cwd.mockReturnValue(
      resolvePath(tmpDir, 'pnpm/apps/backstage/packages/backend'),
    );
    expect(targetPaths.dir).toBe(
      resolvePath(tmpDir, 'pnpm/apps/backstage/packages/backend'),
    );
    expect(targetPaths.workspaceRootDir).toBe(resolvePath(tmpDir, 'pnpm'));
    expect(targetPaths.installationRootDir).toBe(
      resolvePath(tmpDir, 'pnpm/apps/backstage'),
    );
    expect(targetPaths.rootDir).toBe(resolvePath(tmpDir, 'pnpm'));
    expect(targetPaths.resolveWorkspaceRoot('pnpm-lock.yaml')).toBe(
      resolvePath(tmpDir, 'pnpm/pnpm-lock.yaml'),
    );
    expect(targetPaths.resolveInstallationRoot('app-config.yaml')).toBe(
      resolvePath(tmpDir, 'pnpm/apps/backstage/app-config.yaml'),
    );
    expect(targetPaths.resolveRoot('pnpm-lock.yaml')).toBe(
      resolvePath(tmpDir, 'pnpm/pnpm-lock.yaml'),
    );

    // Outside of the installation, the installation root falls back to the workspace root
    cwd.mockReturnValue(resolvePath(tmpDir, 'pnpm/libs/other'));
    expect(targetPaths.workspaceRootDir).toBe(resolvePath(tmpDir, 'pnpm'));
    expect(targetPaths.installationRootDir).toBe(resolvePath(tmpDir, 'pnpm'));

    cwd.mockReturnValue(resolvePath(tmpDir, 'yarn/packages/app'));
    expect(targetPaths.workspaceRootDir).toBe(resolvePath(tmpDir, 'yarn'));
    expect(targetPaths.installationRootDir).toBe(resolvePath(tmpDir, 'yarn'));

    cwd.mockReturnValue(resolvePath(tmpDir, 'standalone'));
    expect(targetPaths.workspaceRootDir).toBe(
      resolvePath(tmpDir, 'standalone'),
    );
    expect(targetPaths.installationRootDir).toBe(
      resolvePath(tmpDir, 'standalone'),
    );
  });

  it('can be overridden with separate roots', () => {
    const override = overrideTargetPaths({
      dir: '/ws/apps/backstage/packages/backend',
      workspaceRootDir: '/ws',
      installationRootDir: '/ws/apps/backstage',
    });
    try {
      expect(targetPaths.dir).toBe('/ws/apps/backstage/packages/backend');
      expect(targetPaths.workspaceRootDir).toBe('/ws');
      expect(targetPaths.installationRootDir).toBe('/ws/apps/backstage');
      expect(targetPaths.rootDir).toBe('/ws');
      expect(targetPaths.resolveWorkspaceRoot('a')).toBe('/ws/a');
      expect(targetPaths.resolveInstallationRoot('a')).toBe(
        '/ws/apps/backstage/a',
      );
      expect(targetPaths.resolveRoot('a')).toBe('/ws/a');
    } finally {
      override.restore();
    }

    const shorthand = overrideTargetPaths('/ws');
    try {
      expect(targetPaths.workspaceRootDir).toBe('/ws');
      expect(targetPaths.installationRootDir).toBe('/ws');
    } finally {
      shorthand.restore();
    }
  });
});
