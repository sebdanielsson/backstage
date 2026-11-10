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
import path from 'node:path';
import { hashFile, validateDeploymentArtifacts } from './appBuild';

/**
 * Builds the argument list for `docker buildx create`.
 */
export function buildxCreateArgs(name: string): string[] {
  return [
    'buildx',
    'create',
    '--name',
    name,
    '--driver',
    'docker-container',
    '--driver-opt',
    'network=host',
    '--buildkitd-flags',
    '--allow-insecure-entitlement network.host',
  ];
}

/**
 * Builds the argument list for `docker buildx build`. The build runs on the
 * host network so that it can reach the fixture registry on the loopback
 * interface, and receives the npmrc as a build secret.
 */
export function buildxBuildArgs(options: {
  builder: string;
  contextDir: string;
  dockerfile: string;
  npmrcPath: string;
  iidFile: string;
}): string[] {
  return [
    'buildx',
    'build',
    '--builder',
    options.builder,
    '--network',
    'host',
    '--allow',
    'network.host',
    '--secret',
    `id=npmrc,src=${options.npmrcPath}`,
    '--load',
    '--iidfile',
    options.iidFile,
    '--progress',
    'plain',
    '-f',
    options.dockerfile,
    options.contextDir,
  ];
}

/**
 * A Buildx builder that this process created and is therefore responsible for
 * removing.
 */
export type OwnedBuilder = {
  build(options: {
    contextDir: string;
    dockerfile: string;
    npmrcPath: string;
    iidFile: string;
    logPath: string;
  }): Promise<string>;
  remove(): Promise<void>;
};

/**
 * Creates a dedicated container-driver builder. Removing it is idempotent, so
 * cleanup can always call `remove`.
 */
export async function createOwnedBuilder(runId: string): Promise<OwnedBuilder> {
  const name = runId;
  await runOutput(['docker', ...buildxCreateArgs(name)]);
  try {
    await runOutput(['docker', 'buildx', 'inspect', '--bootstrap', name]);
  } catch (error) {
    await runOutput(['docker', 'buildx', 'rm', name]).catch(() => {});
    throw error;
  }

  return {
    async build({ contextDir, dockerfile, npmrcPath, iidFile, logPath }) {
      const chunks: Buffer[] = [];
      try {
        await runOutput(
          [
            'docker',
            ...buildxBuildArgs({
              builder: name,
              contextDir,
              dockerfile,
              npmrcPath,
              iidFile,
            }),
          ],
          {
            onStdout: chunk => chunks.push(chunk),
            onStderr: chunk => chunks.push(chunk),
          },
        );
      } finally {
        await fs.outputFile(logPath, Buffer.concat(chunks));
      }
      return (await fs.readFile(iidFile, 'utf8')).trim();
    },
    async remove() {
      await runOutput(['docker', 'buildx', 'rm', name]).catch(() => {});
    },
  };
}

/**
 * Reads the Node and pnpm versions reported by an application image, without
 * the leading `v` that `node --version` prints.
 */
export async function readImageVersions(options: {
  imageId: string;
}): Promise<{ node: string; pnpm: string }> {
  const node = await runOutput([
    'docker',
    'run',
    '--rm',
    '--entrypoint',
    'node',
    options.imageId,
    '--version',
  ]);
  const pnpm = await runOutput([
    'docker',
    'run',
    '--rm',
    '--entrypoint',
    'pnpm',
    options.imageId,
    '--version',
  ]);
  return {
    node: node.trim().replace(/^v/, ''),
    pnpm: pnpm.trim().replace(/^v/, ''),
  };
}

/**
 * Builds the generated application's backend image from its deployment
 * archives, and throws if Docker observed inputs that changed mid-build.
 */
export async function buildAppImage(
  builder: OwnedBuilder,
  options: {
    appDir: string;
    consumerNpmrcPath: string;
    artifactsDir: string;
  },
): Promise<{ imageId: string; buildLog: string }> {
  const { dockerfile, skeleton, bundle } = await validateDeploymentArtifacts(
    options.appDir,
  );
  const files = [dockerfile, skeleton, bundle];
  const before = await Promise.all(files.map(hashFile));
  const buildLog = path.join(options.artifactsDir, 'docker-build.log');
  await fs.ensureDir(options.artifactsDir);

  const imageId = await builder.build({
    contextDir: options.appDir,
    dockerfile,
    npmrcPath: options.consumerNpmrcPath,
    iidFile: path.join(options.artifactsDir, 'image-id'),
    logPath: buildLog,
  });

  const after = await Promise.all(files.map(hashFile));
  const changed = files.filter((file, index) => before[index] !== after[index]);
  if (changed.length > 0) {
    throw new Error(
      `Deployment artifacts changed during the image build: ${changed.join(
        ', ',
      )}`,
    );
  }
  return { imageId, buildLog };
}
