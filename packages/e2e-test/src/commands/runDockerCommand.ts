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

import { findOwnPaths, runOutput } from '@backstage/cli-common';
import { PackageGraph } from '@backstage/cli-node';
import fs from 'fs-extra';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {
  collectAppRepositoryNames,
  expectedArtifactCount,
  readAppRepositoryStartNames,
} from '../lib/appClosure';
import {
  buildApp,
  installApp,
  readGeneratedConfig,
  validateDeploymentArtifacts,
} from '../lib/appBuild';
import { createCleanupStack } from '../lib/cleanup';
import type { CleanupStack } from '../lib/cleanup';
import { createAppFromWorkspace } from '../lib/createApp';
import { prepareSourceArtifacts } from '../lib/distWorkspace';
import type { PreparedArtifacts } from '../lib/distWorkspace';
import {
  buildAppImage,
  createOwnedBuilder,
  readImageVersions,
} from '../lib/dockerBuild';
import { print } from '../lib/helpers';
import { getPackageManager } from '../lib/packageManager';
import {
  REGISTRY_IMAGE,
  startRegistry,
  verifyResolvedLockfile,
} from '../lib/packageRegistry';
import type { RegistryFixture } from '../lib/packageRegistry';

const MINIMUM_BASE_NODE_VERSION = '24.15.0';

/**
 * The phases of a Docker smoke run, in execution order. Each phase registers
 * the resources it creates with the cleanup stack.
 */
export type DockerRunPhases = {
  prepare(cleanup: CleanupStack): Promise<PreparedArtifacts>;
  startRegistry(
    prepared: PreparedArtifacts,
    cleanup: CleanupStack,
  ): Promise<RegistryFixture>;
  generateApp(registry: RegistryFixture): Promise<string>;
  buildApp(
    appDir: string,
    prepared: PreparedArtifacts,
    registry: RegistryFixture,
    cleanup: CleanupStack,
  ): Promise<{
    imageId: string;
    baseImage: string;
    baseImageDigest: string;
    nodeVersion: string;
    pnpmVersion: string;
    artifactCoverage: { verified: number; expected: number };
  }>;
};

export type DockerSmokeResult = {
  imageId: string;
  baseImage: string;
  baseImageDigest: string;
  sourceCommit: string;
  nodeVersion: string;
  pnpmVersion: string;
  artifactCoverage: { verified: number; expected: number };
  phaseDurationsMs: Record<string, number>;
};

export function assertSupportedPlatform(platform: NodeJS.Platform): void {
  if (platform !== 'linux') {
    throw new Error(`run-docker requires Linux, but this host is ${platform}`);
  }
}

/**
 * Returns the Node base image reference from a backend Dockerfile.
 */
export function parseBaseImage(dockerfile: string): string {
  const match = dockerfile.match(/^FROM\s+(node:\S+)/m);
  if (!match) {
    throw new Error(
      'No node base image found in the backend Dockerfile template',
    );
  }
  return match[1];
}

export function isNodeVersionAtLeast(
  version: string,
  minimum: string,
): boolean {
  const current = version.replace(/^v/, '').split('.').map(Number);
  const required = minimum.split('.').map(Number);
  for (let i = 0; i < required.length; i++) {
    if ((current[i] ?? 0) !== required[i]) {
      return (current[i] ?? 0) > required[i];
    }
  }
  return true;
}

/**
 * Checks that the host runs the same Node version as the template base image,
 * since the host build steps must match the image.
 */
export function assertHostNodeVersion(expected: string, actual: string): void {
  if (actual !== expected) {
    throw new Error(
      `The template base image runs Node ${expected}, but the host runs Node ${actual}`,
    );
  }
}

/**
 * Checks that the built application image runs the Node and pnpm versions that
 * the host build used.
 */
export function assertImageVersions(options: {
  expectedNode: string;
  expectedPnpm: string;
  actualNode: string;
  actualPnpm: string;
}): void {
  const { expectedNode, expectedPnpm, actualNode, actualPnpm } = options;
  if (actualNode !== expectedNode) {
    throw new Error(
      `The application image runs Node ${actualNode}, expected Node ${expectedNode}`,
    );
  }
  if (actualPnpm !== expectedPnpm) {
    throw new Error(
      `The application image runs pnpm ${actualPnpm}, expected pnpm ${expectedPnpm}`,
    );
  }
}

async function readImageDigest(image: string): Promise<string> {
  try {
    return await runOutput([
      'docker',
      'image',
      'inspect',
      '--format',
      '{{index .RepoDigests 0}}',
      image,
    ]);
  } catch {
    return await runOutput([
      'docker',
      'image',
      'inspect',
      '--format',
      '{{.Id}}',
      image,
    ]);
  }
}

/**
 * Checks the host toolchain before any expensive work starts.
 */
async function runPreflight(repoRoot: string): Promise<{
  baseImage: string;
  baseImageDigest: string;
  nodeVersion: string;
}> {
  assertSupportedPlatform(process.platform);
  await runOutput(['docker', 'version']);
  await runOutput(['docker', 'buildx', 'version']);
  // The repository pins Yarn in its root package.json, so probe pnpm outside.
  await runOutput(['pnpm', '--version'], { cwd: os.tmpdir() });

  const dockerfilePath = path.join(
    repoRoot,
    'packages/create-app/templates/default-app/packages/backend/Dockerfile.hbs',
  );
  const baseImage = parseBaseImage(await fs.readFile(dockerfilePath, 'utf8'));
  await runOutput(['docker', 'pull', baseImage]);
  const version = await runOutput([
    'docker',
    'run',
    '--rm',
    '--entrypoint',
    'node',
    baseImage,
    '--version',
  ]);
  const nodeVersion = version.replace(/^v/, '');
  if (!isNodeVersionAtLeast(nodeVersion, MINIMUM_BASE_NODE_VERSION)) {
    throw new Error(
      `The template base image ${baseImage} provides Node ${nodeVersion}, expected at least ${MINIMUM_BASE_NODE_VERSION}`,
    );
  }
  assertHostNodeVersion(nodeVersion, process.versions.node);
  const baseImageDigest = await readImageDigest(baseImage);
  print(
    `Base image ${baseImage} (${baseImageDigest}) provides Node ${nodeVersion}`,
  );
  return { baseImage, baseImageDigest, nodeVersion };
}

/**
 * Runs the phases in order, records how long each one took, and always runs
 * the cleanup stack. Cleanup failures are appended to the primary error
 * rather than replacing it.
 */
export async function runDockerPhases(
  phases: DockerRunPhases,
): Promise<DockerSmokeResult> {
  const cleanup = createCleanupStack();
  const phaseDurationsMs: Record<string, number> = {};
  let result: DockerSmokeResult | undefined;
  let primaryError: unknown;
  let cleanupFailures: string[] = [];

  const measure = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await fn();
    } finally {
      phaseDurationsMs[name] = Date.now() - startedAt;
    }
  };

  try {
    const prepared = await measure('prepare', () => phases.prepare(cleanup));
    const registry = await measure('startRegistry', () =>
      phases.startRegistry(prepared, cleanup),
    );
    const appDir = await measure('generateApp', () =>
      phases.generateApp(registry),
    );
    const built = await measure('buildApp', () =>
      phases.buildApp(appDir, prepared, registry, cleanup),
    );
    result = {
      ...built,
      // Every artifact is packed from the same commit.
      sourceCommit: prepared.artifacts[0]?.sourceCommit ?? '',
      phaseDurationsMs,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    cleanupFailures = await cleanup.run();
  }

  if (primaryError !== undefined) {
    if (cleanupFailures.length > 0) {
      const message = `Cleanup failures:\n${cleanupFailures.join('\n')}`;
      if (primaryError instanceof Error) {
        primaryError.message = `${primaryError.message}\n${message}`;
      } else {
        primaryError = new Error(`${String(primaryError)}\n${message}`);
      }
    }
    throw primaryError;
  }
  if (cleanupFailures.length > 0) {
    throw new Error(`Cleanup failures:\n${cleanupFailures.join('\n')}`);
  }

  return result!;
}

/**
 * Packs the repository, serves its packages from a disposable registry,
 * generates and installs a pnpm app, and builds its production image.
 */
export async function runDockerCommand(opts: {
  keep?: boolean;
  artifactsDirectory?: string;
}): Promise<void> {
  /* eslint-disable-next-line no-restricted-syntax */
  const repoRoot = findOwnPaths(__dirname).rootDir;
  const preflight = await runPreflight(repoRoot);

  const sourceCommit = await runOutput(['git', 'rev-parse', 'HEAD'], {
    cwd: repoRoot,
  });
  const runId = `e2e-docker-${Date.now()}-${randomUUID()}`;
  const runDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'backstage-e2e-docker-'),
  );
  const artifactsDir = opts.artifactsDirectory
    ? path.resolve(opts.artifactsDirectory)
    : path.join(runDir, 'artifacts');
  await fs.ensureDir(artifactsDir);
  print(`run-docker run id: ${runId}`);
  print(`run-docker run dir: ${runDir}`);
  print(`run-docker artifacts dir: ${artifactsDir}`);

  const storeDir = path.join(runDir, 'store');
  let prepared: PreparedArtifacts | undefined;

  const phases: DockerRunPhases = {
    async prepare() {
      print('Packing the always-packed source closure');
      prepared = await prepareSourceArtifacts({
        rootDir: runDir,
        artifactsDir,
        sourceCommit,
      });
      print(`Packed ${prepared.artifacts.length} source packages`);
      return prepared;
    },

    async startRegistry(preparedArtifacts, cleanup) {
      const registry = await startRegistry({
        runId,
        seededPackageNames: preparedArtifacts.artifacts.map(
          artifact => artifact.name,
        ),
        repositoryPackageNames: preparedArtifacts.repositoryPackageNames,
        image: REGISTRY_IMAGE,
        workDir: path.join(runDir, 'registry'),
      });
      cleanup.add('registry', () => registry.stop());
      cleanup.add('registry logs', () =>
        registry.captureLogs(path.join(artifactsDir, 'registry.log')),
      );

      print(`Publishing source packages to ${registry.url}`);
      await registry.publish(preparedArtifacts.artifacts);
      await registry.verify(preparedArtifacts.artifacts);

      const seededNames = new Set(
        preparedArtifacts.artifacts.map(artifact => artifact.name),
      );
      const unseededName = [...preparedArtifacts.repositoryPackageNames].find(
        name => !seededNames.has(name),
      );
      if (unseededName === undefined) {
        throw new Error(
          'Every repository package is part of the captured closure',
        );
      }
      await registry.verifyUnseededRepositoryName(unseededName);
      return registry;
    },

    async generateApp(registry) {
      if (!prepared) {
        throw new Error('The prepare phase did not produce artifacts');
      }
      const appDir = await createAppFromWorkspace({
        appName: 'test-app',
        workspaceDir: prepared.bootstrapWorkspace,
        rootDir: runDir,
        packageManager: getPackageManager('pnpm'),
      });
      await fs.copy(registry.consumerNpmrcPath, path.join(appDir, '.npmrc'));
      const consumerNpmrcPath = registry.consumerNpmrcPath;

      print('Installing the generated app');
      await installApp({ appDir, consumerNpmrcPath, storeDir, frozen: false });
      const { pnpmVersion } = await installApp({
        appDir,
        consumerNpmrcPath,
        storeDir,
        frozen: true,
      });

      const { packageManager } = await readGeneratedConfig(appDir);
      const pinnedVersion = packageManager.replace(/^pnpm@/, '');
      if (pnpmVersion !== pinnedVersion) {
        throw new Error(
          `The app pins ${packageManager} but the running pnpm is ${pnpmVersion}`,
        );
      }
      print(`Installed with pnpm ${pnpmVersion}`);
      return appDir;
    },

    async buildApp(appDir, preparedArtifacts, registry, cleanup) {
      const consumerNpmrcPath = registry.consumerNpmrcPath;
      print('Building the generated backend');
      await buildApp({ appDir, consumerNpmrcPath });

      const coverage = await verifyResolvedLockfile({
        lockfilePath: path.join(appDir, 'pnpm-lock.yaml'),
        registryUrl: registry.url,
        artifacts: preparedArtifacts.artifacts,
        repositoryPackageNames: preparedArtifacts.repositoryPackageNames,
      });
      const appRepositoryNames = collectAppRepositoryNames(
        await PackageGraph.listTargetPackages(),
        await readAppRepositoryStartNames(appDir),
      );
      const expected = expectedArtifactCount(
        preparedArtifacts.artifacts,
        appRepositoryNames,
      );
      if (coverage.verified !== expected) {
        throw new Error(
          `Source artifact coverage is ${coverage.verified}/${expected}`,
        );
      }
      print(`Source artifact coverage: ${coverage.verified}/${expected}`);

      await validateDeploymentArtifacts(appDir);

      const builder = await createOwnedBuilder(runId);
      cleanup.add('builder', () => builder.remove());
      const { imageId } = await buildAppImage(builder, {
        appDir,
        consumerNpmrcPath,
        artifactsDir,
      });
      const versions = await readImageVersions({ imageId });
      const { packageManager } = await readGeneratedConfig(appDir);
      assertImageVersions({
        expectedNode: preflight.nodeVersion,
        expectedPnpm: packageManager.replace(/^pnpm@/, ''),
        actualNode: versions.node,
        actualPnpm: versions.pnpm,
      });
      print(`Built ${imageId}: node ${versions.node}, pnpm ${versions.pnpm}`);
      return {
        imageId,
        baseImage: preflight.baseImage,
        baseImageDigest: preflight.baseImageDigest,
        nodeVersion: versions.node,
        pnpmVersion: versions.pnpm,
        artifactCoverage: { verified: coverage.verified, expected },
      };
    },
  };

  try {
    const summary = await runDockerPhases(phases);
    await fs.outputJson(path.join(artifactsDir, 'run-summary.json'), summary, {
      spaces: 2,
    });
    if (opts.keep) {
      print(`Run artifacts kept at ${runDir}`);
      print(`Generated app kept at ${path.join(runDir, 'test-app')}`);
    } else if (opts.artifactsDirectory) {
      print(`Run artifacts written to ${artifactsDir}`);
    }
  } finally {
    if (!opts.keep) {
      await fs.remove(runDir).catch(() => {});
    }
  }
}
