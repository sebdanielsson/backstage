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
import { join as joinPath, resolve as resolvePath } from 'node:path';
import {
  findPaths,
  findRootPath,
  findOwnRootDir,
  findOwnPaths,
  targetPaths,
} from './paths';

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

  describe('with pnpm-workspace.yaml', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.realpathSync(
        fs.mkdtempSync(joinPath(os.tmpdir(), 'backstage-cli-common-paths-')),
      );
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('targetPaths should find the root of a pnpm workspace', () => {
      fs.writeFileSync(
        joinPath(tmpDir, 'package.json'),
        JSON.stringify({ name: 'root' }),
      );
      fs.writeFileSync(
        joinPath(tmpDir, 'pnpm-workspace.yaml'),
        'packages:\n  - packages/*\n',
      );
      const pkgDir = joinPath(tmpDir, 'packages', 'a');
      fs.mkdirSync(joinPath(pkgDir, 'src'), { recursive: true });
      fs.writeFileSync(
        joinPath(pkgDir, 'package.json'),
        JSON.stringify({ name: 'a' }),
      );

      jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
      expect(targetPaths.dir).toBe(tmpDir);
      expect(targetPaths.rootDir).toBe(tmpDir);
      expect(targetPaths.resolveRoot('derp.txt')).toBe(
        joinPath(tmpDir, 'derp.txt'),
      );

      // A nested package without a workspaces field should resolve to the pnpm root
      jest.spyOn(process, 'cwd').mockReturnValue(joinPath(pkgDir, 'src'));
      expect(targetPaths.dir).toBe(joinPath(pkgDir, 'src'));
      expect(targetPaths.rootDir).toBe(tmpDir);
      expect(targetPaths.resolveRoot('derp.txt')).toBe(
        joinPath(tmpDir, 'derp.txt'),
      );

      // Without pnpm-workspace.yaml the nested package is its own root
      fs.rmSync(joinPath(tmpDir, 'pnpm-workspace.yaml'));
      jest.spyOn(process, 'cwd').mockReturnValue(pkgDir);
      expect(targetPaths.rootDir).toBe(pkgDir);
    });
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
