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
import {
  hashFile,
  readGeneratedConfig,
  validateDeploymentArtifacts,
} from './appBuild';

describe('readGeneratedConfig', () => {
  it('reads the emitted pin and preserved policies', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'app-config-'));
    await fs.outputJson(path.join(dir, 'package.json'), {
      packageManager: 'pnpm@12.14.0',
    });
    await fs.outputFile(
      path.join(dir, 'pnpm-workspace.yaml'),
      'nodeLinker: hoisted\n' +
        'minimumReleaseAge: 4320\n' +
        'minimumReleaseAgeExclude:\n  - "@backstage/*"\n' +
        'allowBuilds:\n  better-sqlite3: true\n',
    );

    await expect(readGeneratedConfig(dir)).resolves.toEqual({
      packageManager: 'pnpm@12.14.0',
      nodeLinker: 'hoisted',
      minimumReleaseAge: 4320,
      minimumReleaseAgeExclude: ['@backstage/*'],
      allowBuilds: { 'better-sqlite3': true },
    });
  });

  it('rejects a generated app missing a required field', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'app-config-'));
    await fs.outputJson(path.join(dir, 'package.json'), {
      packageManager: 'pnpm@12.14.0',
    });
    await fs.outputFile(
      path.join(dir, 'pnpm-workspace.yaml'),
      'nodeLinker: hoisted\n' +
        'minimumReleaseAgeExclude: []\n' +
        'allowBuilds: {}\n',
    );

    await expect(readGeneratedConfig(dir)).rejects.toThrow(/minimumReleaseAge/);
  });
});

describe('validateDeploymentArtifacts', () => {
  it('requires the Dockerfile and both archives', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifacts-'));
    await expect(validateDeploymentArtifacts(dir)).rejects.toThrow(
      /packages\/backend\/Dockerfile/,
    );

    await fs.outputFile(path.join(dir, 'packages/backend/Dockerfile'), '');
    await expect(validateDeploymentArtifacts(dir)).rejects.toThrow(
      /skeleton\.tar\.gz/,
    );

    await fs.outputFile(
      path.join(dir, 'packages/backend/dist/skeleton.tar.gz'),
      '',
    );
    await expect(validateDeploymentArtifacts(dir)).rejects.toThrow(
      /bundle\.tar\.gz/,
    );

    await fs.outputFile(
      path.join(dir, 'packages/backend/dist/bundle.tar.gz'),
      '',
    );
    await expect(validateDeploymentArtifacts(dir)).resolves.toEqual({
      dockerfile: path.join(dir, 'packages/backend/Dockerfile'),
      skeleton: path.join(dir, 'packages/backend/dist/skeleton.tar.gz'),
      bundle: path.join(dir, 'packages/backend/dist/bundle.tar.gz'),
    });
  });
});

describe('hashFile', () => {
  it('returns a stable sha256 of the file contents', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hash-'));
    const first = path.join(dir, 'first');
    const copy = path.join(dir, 'copy');
    const other = path.join(dir, 'other');
    await fs.outputFile(first, 'same contents');
    await fs.outputFile(copy, 'same contents');
    await fs.outputFile(other, 'different contents');

    await expect(hashFile(first)).resolves.toMatch(/^[0-9a-f]{64}$/);
    expect(await hashFile(first)).toBe(await hashFile(copy));
    expect(await hashFile(first)).not.toBe(await hashFile(other));
  });
});
