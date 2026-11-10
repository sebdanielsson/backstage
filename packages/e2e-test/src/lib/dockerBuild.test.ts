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

import { runOutput } from '@backstage/cli-common';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { hashFile } from './appBuild';
import {
  buildAppImage,
  buildxBuildArgs,
  buildxCreateArgs,
  readImageVersions,
  type OwnedBuilder,
} from './dockerBuild';

jest.mock('@backstage/cli-common', () => ({ runOutput: jest.fn() }));

const runOutputMock = runOutput as jest.MockedFunction<typeof runOutput>;

async function createAppFixture(): Promise<{
  appDir: string;
  artifactsDir: string;
  files: string[];
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'docker-build-'));
  const appDir = path.join(root, 'app');
  const artifactsDir = path.join(root, 'artifacts');
  const files = [
    path.join(appDir, 'packages/backend/Dockerfile'),
    path.join(appDir, 'packages/backend/dist/skeleton.tar.gz'),
    path.join(appDir, 'packages/backend/dist/bundle.tar.gz'),
  ];
  await fs.outputFile(files[0], 'FROM node:24\n');
  await fs.outputFile(files[1], 'skeleton archive');
  await fs.outputFile(files[2], 'bundle archive');
  return { appDir, artifactsDir, files };
}

describe('buildx arguments', () => {
  it('creates a container-driver builder with host networking allowed', () => {
    expect(buildxCreateArgs('e2e-run')).toEqual([
      'buildx',
      'create',
      '--name',
      'e2e-run',
      '--driver',
      'docker-container',
      '--driver-opt',
      'network=host',
      '--buildkitd-flags',
      '--allow-insecure-entitlement network.host',
    ]);
  });

  it('builds with host networking, the npmrc secret, and an image id file', () => {
    expect(
      buildxBuildArgs({
        builder: 'e2e-run',
        contextDir: '/app',
        dockerfile: '/app/packages/backend/Dockerfile',
        npmrcPath: '/tmp/consumer.npmrc',
        iidFile: '/tmp/iid',
      }),
    ).toEqual([
      'buildx',
      'build',
      '--builder',
      'e2e-run',
      '--network',
      'host',
      '--allow',
      'network.host',
      '--secret',
      'id=npmrc,src=/tmp/consumer.npmrc',
      '--load',
      '--iidfile',
      '/tmp/iid',
      '--progress',
      'plain',
      '-f',
      '/app/packages/backend/Dockerfile',
      '/app',
    ]);
  });
});

describe('buildAppImage', () => {
  it('builds the generated backend Dockerfile and returns the image id and log path', async () => {
    const { appDir, artifactsDir, files } = await createAppFixture();
    const before = await Promise.all(files.map(hashFile));
    const build = jest.fn(async () => 'sha256:abc');
    const builder: OwnedBuilder = { build, remove: async () => {} };

    await expect(
      buildAppImage(builder, {
        appDir,
        consumerNpmrcPath: '/tmp/consumer.npmrc',
        artifactsDir,
      }),
    ).resolves.toEqual({
      imageId: 'sha256:abc',
      buildLog: path.join(artifactsDir, 'docker-build.log'),
    });

    expect(build).toHaveBeenCalledWith({
      contextDir: appDir,
      dockerfile: path.join(appDir, 'packages/backend/Dockerfile'),
      npmrcPath: '/tmp/consumer.npmrc',
      iidFile: path.join(artifactsDir, 'image-id'),
      logPath: path.join(artifactsDir, 'docker-build.log'),
    });
    expect(await Promise.all(files.map(hashFile))).toEqual(before);
    expect(await fs.pathExists(artifactsDir)).toBe(true);
  });

  it('throws when an input artifact changes during the build', async () => {
    const { appDir, artifactsDir, files } = await createAppFixture();
    const builder: OwnedBuilder = {
      async build() {
        await fs.appendFile(files[2], 'mutated');
        return 'sha256:abc';
      },
      async remove() {},
    };

    await expect(
      buildAppImage(builder, {
        appDir,
        consumerNpmrcPath: '/tmp/consumer.npmrc',
        artifactsDir,
      }),
    ).rejects.toThrow(
      /changed during the image build: .*packages\/backend\/dist\/bundle\.tar\.gz/,
    );
  });
});

describe('readImageVersions', () => {
  it('runs node and pnpm in the image and trims their versions', async () => {
    runOutputMock
      .mockResolvedValueOnce('v24.15.0\n')
      .mockResolvedValueOnce('v10.15.0\n');

    await expect(readImageVersions({ imageId: 'sha256:abc' })).resolves.toEqual(
      { node: '24.15.0', pnpm: '10.15.0' },
    );

    expect(runOutputMock).toHaveBeenNthCalledWith(1, [
      'docker',
      'run',
      '--rm',
      '--entrypoint',
      'node',
      'sha256:abc',
      '--version',
    ]);
    expect(runOutputMock).toHaveBeenNthCalledWith(2, [
      'docker',
      'run',
      '--rm',
      '--entrypoint',
      'pnpm',
      'sha256:abc',
      '--version',
    ]);
  });
});
