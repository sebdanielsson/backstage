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
import { setTimeout as delay } from 'node:timers/promises';
import { parse as parseYaml } from 'yaml';
import type { SourcePackageArtifact } from './distWorkspace';
import { runIsolated } from './process';
import {
  assertPublishTarget,
  buildConsumerNpmrc,
  buildPublisherNpmrc,
  buildRegistryConfig,
} from './registryConfig';

const REGISTRY_READY_TIMEOUT_MS = 60_000;
const REGISTRY_POLL_INTERVAL_MS = 500;

type RegistryMetadata = {
  versions?: Record<
    string,
    { dist?: { tarball?: string; integrity?: string } }
  >;
};

/**
 * A disposable Verdaccio instance that source packages can be published to,
 * and the consumer can then install from.
 */
export type RegistryFixture = {
  url: string;
  consumerNpmrcPath: string;
  publisherNpmrcPath: string;
  publish(artifacts: readonly SourcePackageArtifact[]): Promise<void>;
  verify(artifacts: readonly SourcePackageArtifact[]): Promise<void>;
  verifyUnseededRepositoryName(name: string): Promise<void>;
  captureLogs(destination: string): Promise<void>;
  stop(): Promise<void>;
};

async function waitForRegistry(url: string): Promise<void> {
  const deadline = Date.now() + REGISTRY_READY_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/-/ping`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) {
        return;
      }
      lastError = new Error(`registry responded with ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(REGISTRY_POLL_INTERVAL_MS);
  }
  throw new Error(`Registry at ${url} did not become ready: ${lastError}`);
}

async function startContainer(
  containerName: string,
  confDir: string,
  storageDir: string,
  image: string,
): Promise<string> {
  try {
    await runOutput([
      'docker',
      'run',
      '-d',
      '--rm',
      '--name',
      containerName,
      '-p',
      '127.0.0.1::4873',
      '-v',
      `${confDir}:/verdaccio/conf:ro`,
      '-v',
      `${storageDir}:/verdaccio/storage`,
      image,
    ]);
    const port = await runOutput([
      'docker',
      'inspect',
      '--format',
      '{{(index (index .NetworkSettings.Ports "4873/tcp") 0).HostPort}}',
      containerName,
    ]);
    const url = `http://127.0.0.1:${port}`;
    await waitForRegistry(url);
    return url;
  } catch (error) {
    await runOutput(['docker', 'rm', '-f', containerName]).catch(() => {});
    throw error;
  }
}

async function fetchMetadata(
  url: string,
  name: string,
): Promise<RegistryMetadata> {
  const response = await fetch(`${url}/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch metadata for ${name}: ${response.status}`);
  }
  return (await response.json()) as RegistryMetadata;
}

/**
 * Starts the disposable registry and prepares the npmrc files for the
 * consumer and the publisher.
 */
export async function startRegistry(options: {
  runId: string;
  seededPackageNames: readonly string[];
  repositoryPackageNames: ReadonlySet<string>;
  image: string;
  workDir: string;
}): Promise<RegistryFixture> {
  if (process.env.VERDACCIO_PUBLIC_URL) {
    // The tarball URLs must reflect the discovered port, which a fixed public
    // URL would override.
    throw new Error(
      'VERDACCIO_PUBLIC_URL must not be set when starting the fixture registry',
    );
  }

  const confDir = path.join(options.workDir, 'conf');
  const storageDir = path.join(options.workDir, 'storage');
  const consumerNpmrcPath = path.join(options.workDir, 'consumer.npmrc');
  const publisherNpmrcPath = path.join(options.workDir, 'publisher.npmrc');
  await fs.outputFile(
    path.join(confDir, 'config.yaml'),
    buildRegistryConfig({
      seededPackageNames: options.seededPackageNames,
      repositoryPackageNames: options.repositoryPackageNames,
    }),
  );
  await fs.outputFile(path.join(confDir, 'htpasswd'), '');
  await fs.ensureDir(storageDir);

  const containerName = `${options.runId}-registry`;
  const url = await startContainer(
    containerName,
    confDir,
    storageDir,
    options.image,
  );
  await fs.outputFile(consumerNpmrcPath, buildConsumerNpmrc(url));
  await fs.outputFile(publisherNpmrcPath, buildPublisherNpmrc(url));

  return {
    url,
    consumerNpmrcPath,
    publisherNpmrcPath,
    async publish(artifacts) {
      for (const artifact of artifacts) {
        await assertPublishTarget(artifact.archivePath, url);
        if (artifact.private === true) {
          continue;
        }
        await runIsolated(
          [
            'npm',
            'publish',
            artifact.archivePath,
            '--registry',
            url,
            '--userconfig',
            publisherNpmrcPath,
            '--access',
            'public',
            '--ignore-scripts',
          ],
          {
            cwd: options.workDir,
            env: { npm_config_userconfig: publisherNpmrcPath },
          },
        );
      }
    },
    async verify(artifacts) {
      for (const artifact of artifacts) {
        if (artifact.private === true) {
          continue;
        }
        const metadata = await fetchMetadata(url, artifact.name);
        const version = metadata.versions?.[artifact.version];
        if (!version) {
          throw new Error(
            `Registry is missing ${artifact.name}@${artifact.version}`,
          );
        }
        const tarball = version.dist?.tarball;
        if (!tarball || new URL(tarball).host !== new URL(url).host) {
          throw new Error(
            `Tarball for ${artifact.name}@${artifact.version} does not point at the fixture registry: ${tarball}`,
          );
        }
        if (version.dist?.integrity !== artifact.integrity) {
          throw new Error(
            `Integrity mismatch for ${artifact.name}@${artifact.version}: expected ${artifact.integrity}, found ${version.dist?.integrity}`,
          );
        }
      }
    },
    async verifyUnseededRepositoryName(name) {
      const response = await fetch(`${url}/${encodeURIComponent(name)}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status !== 404) {
        throw new Error(
          `Expected ${name} to be unavailable from the fixture registry, got ${response.status}`,
        );
      }
    },
    async captureLogs(destination) {
      const logs = await runOutput(['docker', 'logs', containerName]);
      await fs.outputFile(destination, logs);
    },
    async stop() {
      await runOutput(['docker', 'rm', '-f', containerName]).catch(() => {});
    },
  };
}

/**
 * Verifies that every repository package in an installed lockfile resolved
 * from the fixture registry to a seeded artifact.
 */
export async function verifyResolvedLockfile(options: {
  lockfilePath: string;
  registryUrl: string;
  artifacts: readonly SourcePackageArtifact[];
  repositoryPackageNames: ReadonlySet<string>;
}): Promise<{ verified: number; workspaceImporters: string[] }> {
  const content = await fs.readFile(options.lockfilePath, 'utf8');
  // These libraries are only published as ES modules
  const { convertToLockfileObject, extractMainDocument } = await import(
    '@pnpm/lockfile.fs'
  );
  const { getPkgIdWithPatchHash, parse: parseDepPath } = await import(
    '@pnpm/deps.path'
  );

  let lockfileFile;
  try {
    lockfileFile = parseYaml(
      extractMainDocument(content.replace(/^\uFEFF/, '')),
    );
  } catch (error) {
    throw new Error(`Failed pnpm-lock.yaml parse, ${error}`);
  }
  if (!lockfileFile || typeof lockfileFile !== 'object') {
    throw new Error('Failed pnpm-lock.yaml parse, the lockfile is empty');
  }
  const lockfileVersion = String(lockfileFile.lockfileVersion);
  if (!/^9(\.|$)/.test(lockfileVersion)) {
    throw new Error(
      `Unsupported pnpm-lock.yaml version '${lockfileVersion}', only version 9 lockfiles are supported`,
    );
  }
  const lockfile = convertToLockfileObject(lockfileFile);

  const registryPrefix = options.registryUrl.replace(/\/+$/, '');
  let verified = 0;
  for (const [depPath, pkg] of Object.entries(lockfile.packages ?? {})) {
    // Peer suffixes must not prevent a match with the seeded artifact
    const packageId = getPkgIdWithPatchHash(
      depPath as Parameters<typeof getPkgIdWithPatchHash>[0],
    );
    const parsed = parseDepPath(packageId);
    if (!parsed.name || !options.repositoryPackageNames.has(parsed.name)) {
      continue;
    }
    const version =
      parsed.version ??
      (pkg as { version?: string }).version ??
      parsed.nonSemverVersion;
    const artifact = options.artifacts.find(
      a => a.name === parsed.name && a.version === version,
    );
    if (!artifact) {
      throw new Error(`no seeded artifact for ${parsed.name}@${version}`);
    }
    const resolution = pkg.resolution as
      | { integrity?: string; tarball?: string }
      | undefined;
    if (resolution?.integrity !== artifact.integrity) {
      throw new Error(
        `integrity mismatch for ${parsed.name}@${version}: expected ${artifact.integrity}, found ${resolution?.integrity}`,
      );
    }
    if (
      resolution.tarball !== undefined &&
      resolution.tarball !== registryPrefix &&
      !resolution.tarball.startsWith(`${registryPrefix}/`)
    ) {
      throw new Error(
        `tarball for ${parsed.name}@${version} points outside the fixture registry: ${resolution.tarball}`,
      );
    }
    verified++;
  }

  return {
    verified,
    workspaceImporters: Object.keys(lockfile.importers),
  };
}
