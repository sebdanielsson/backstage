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

import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as tar from 'tar';
import { buildWorkspaceArgs, captureSourcePackages } from './distWorkspace';

describe('buildWorkspaceArgs', () => {
  it('passes --always-pack for registry payloads', () => {
    expect(
      buildWorkspaceArgs({
        workspaceDir: '/tmp/ws',
        packageNames: ['@backstage/create-app'],
        alwaysPack: true,
      }),
    ).toEqual([
      'yarn',
      'backstage-cli',
      'build-workspace',
      '--always-pack',
      '/tmp/ws',
      '@backstage/create-app',
    ]);
  });

  it('omits the flag for the existing fast path', () => {
    expect(
      buildWorkspaceArgs({
        workspaceDir: '/tmp/ws',
        packageNames: [],
        alwaysPack: false,
      }),
    ).not.toContain('--always-pack');
  });
});

describe('captureSourcePackages', () => {
  it('wraps packed payloads, records integrity, and rejects repo protocols', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capture-'));
    const workspace = path.join(root, 'workspace');
    await fs.outputJson(path.join(workspace, 'packages/a/package.json'), {
      name: '@backstage/a',
      version: '1.2.3',
      dependencies: { '@backstage/b': '1.0.0' },
    });
    await fs.outputFile(
      path.join(workspace, 'packages/a/dist/index.js'),
      'code',
    );

    const artifacts = await captureSourcePackages({
      workspaceDir: workspace,
      targetDir: path.join(root, 'artifacts'),
      sourceCommit: 'abc123',
    });

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].integrity).toMatch(/^sha512-/);
    const extracted = path.join(root, 'extracted');
    await fs.ensureDir(extracted);
    await tar.extract({ file: artifacts[0].archivePath, cwd: extracted });
    expect(
      await fs.pathExists(path.join(extracted, 'package/package.json')),
    ).toBe(true);

    const expected = `sha512-${createHash('sha512')
      .update(await fs.readFile(artifacts[0].archivePath))
      .digest('base64')}`;
    expect(artifacts[0].integrity).toBe(expected);
  });

  it.each([
    'workspace:^',
    'backstage:^',
    'link:../b',
    'file:../b',
    'patch:b@1',
  ])('rejects a manifest with %s', async protocol => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capture-'));
    const workspace = path.join(root, 'workspace');
    await fs.outputJson(path.join(workspace, 'packages/a/package.json'), {
      name: '@backstage/a',
      version: '1.2.3',
      dependencies: { '@backstage/b': protocol },
    });

    await expect(
      captureSourcePackages({
        workspaceDir: workspace,
        targetDir: path.join(root, 'artifacts'),
        sourceCommit: 'abc',
      }),
    ).rejects.toThrow(/unsupported repository protocol/i);
  });
});
