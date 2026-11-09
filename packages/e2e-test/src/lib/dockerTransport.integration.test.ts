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
import { PackageGraph } from '@backstage/cli-node';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import { parseDocument } from 'yaml';
import {
  collectAppRepositoryNames,
  expectedArtifactCount,
  readAppRepositoryStartNames,
} from './appClosure';
import { createAppFromWorkspace } from './createApp';
import type { PreparedArtifacts, SourcePackageArtifact } from './distWorkspace';
import { prepareSourceArtifacts } from './distWorkspace';
import type { OwnedBuilder } from './dockerBuild';
import { createOwnedBuilder, readImageVersions } from './dockerBuild';
import { print } from './helpers';
import { getPackageManager } from './packageManager';
import type { RegistryFixture } from './packageRegistry';
import {
  REGISTRY_IMAGE,
  startRegistry,
  verifyResolvedLockfile,
} from './packageRegistry';
import { runIsolated } from './process';

jest.setTimeout(60 * 60_000);

const repoRoot = path.resolve(__dirname, '../../../..');
// prepareSourceArtifacts writes the dist workspace below the given root
const closureWorkspace = path.join(repoRoot, 'workspace');

const describePack = process.env.E2E_PACK === '1' ? describe : describe.skip;
const describeDocker =
  process.platform === 'linux' && process.env.E2E_DOCKER === '1'
    ? describe
    : describe.skip;

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

// Ranges with these protocols only resolve inside the repository and cannot be
// installed from the registry.
const REPOSITORY_PROTOCOL = /^(?:workspace|backstage|link|file|patch):/;

type Closure = {
  runDir: string;
  artifactsDir: string;
  prepared: PreparedArtifacts;
  durationMs: number;
};

let workRoot: string | undefined;
let closurePromise: Promise<Closure> | undefined;

/**
 * Builds the always-packed closure once per test file. Both suites use the
 * same closure, and the pack suite is the one that records its size.
 */
function prepareClosure(): Promise<Closure> {
  closurePromise ??= (async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-docker-'));
    workRoot = runDir;
    const artifactsDir = path.join(runDir, 'artifacts');
    const sourceCommit = (
      await runOutput(['git', 'rev-parse', 'HEAD'], { cwd: repoRoot })
    ).trim();
    // A stale workspace from an aborted run would leak packages into the
    // capture, so start from an empty one.
    await fs.remove(closureWorkspace);
    print(
      'Preparing the always-packed closure, this packs every package in the closure',
    );
    const startedAt = Date.now();
    const prepared = await prepareSourceArtifacts({
      rootDir: repoRoot,
      artifactsDir,
      sourceCommit,
    });
    const durationMs = Date.now() - startedAt;
    print(
      `Prepared ${prepared.artifacts.length} source packages in ${durationMs} ms`,
    );
    return { runDir, artifactsDir, prepared, durationMs };
  })();
  return closurePromise;
}

afterAll(async () => {
  if (!closurePromise) {
    return;
  }
  // Best-effort cleanup of the multi-gigabyte build outputs; diagnostics are
  // captured in a separate directory.
  await fs.remove(closureWorkspace).catch(() => {});
  if (workRoot) {
    await fs.remove(workRoot).catch(() => {});
  }
});

describePack('always-packed source artifacts', () => {
  it('captures a protocol-free closure with sha512 integrity', async () => {
    const { artifactsDir, prepared, durationMs } = await prepareClosure();
    const { artifacts } = prepared;
    expect(artifacts.length).toBeGreaterThan(0);

    const sizes = await Promise.all(
      artifacts.map(
        async artifact => (await fs.stat(artifact.archivePath)).size,
      ),
    );
    const totalBytes = sizes.reduce((sum, size) => sum + size, 0);
    print(
      `Closure: ${artifacts.length} packages, ${totalBytes} bytes, prepared in ${durationMs} ms`,
    );

    const manifestDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'e2e-manifests-'),
    );
    try {
      for (const artifact of artifacts) {
        expect(artifact.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/);
        await tar.extract({
          file: artifact.archivePath,
          cwd: manifestDir,
          filter: entryPath => entryPath === 'package/package.json',
        });
        const manifest = (await fs.readJson(
          path.join(manifestDir, 'package/package.json'),
        )) as {
          name?: string;
          version?: string;
          [field: string]: unknown;
        };
        expect(manifest.name).toBe(artifact.name);
        expect(manifest.version).toBe(artifact.version);
        for (const field of DEPENDENCY_FIELDS) {
          for (const [dependency, range] of Object.entries(
            (manifest[field] ?? {}) as Record<string, string>,
          )) {
            // The range must be at the start of the string for the anchored
            // protocol match, with the context after it for failure messages.
            expect(
              `${range} (${artifact.name} ${field}.${dependency})`,
            ).not.toMatch(REPOSITORY_PROTOCOL);
          }
        }
      }
    } finally {
      await fs.remove(manifestDir);
    }

    await expect(
      fs.pathExists(path.join(artifactsDir, 'source-packages.json')),
    ).resolves.toBe(true);
  });
});

describeDocker('registry transport gate', () => {
  it('serves the always-packed closure to a generated app and builds its image', async () => {
    let runDir: string | undefined;
    let registry: RegistryFixture | undefined;
    let builder: OwnedBuilder | undefined;
    try {
      const closure = await prepareClosure();
      runDir = closure.runDir;
      const { prepared } = closure;
      const { artifacts } = prepared;
      const runId = `e2e-docker-${Date.now()}`;
      const registryFixture = await startRegistry({
        runId,
        seededPackageNames: artifacts.map(artifact => artifact.name),
        repositoryPackageNames: prepared.repositoryPackageNames,
        image: REGISTRY_IMAGE,
        workDir: path.join(runDir, 'registry'),
      });
      registry = registryFixture;

      await registryFixture.publish(artifacts);
      await registryFixture.verify(artifacts);

      // A repository package that is not part of the captured closure must not
      // resolve from the public registry.
      const seededNames = new Set(artifacts.map(artifact => artifact.name));
      const unseededName = [...prepared.repositoryPackageNames].find(
        name => !seededNames.has(name),
      );
      expect(unseededName).toBeDefined();
      await registryFixture.verifyUnseededRepositoryName(unseededName!);

      const appDir = await createAppFromWorkspace({
        appName: 'test-app',
        workspaceDir: prepared.bootstrapWorkspace,
        rootDir: runDir,
        packageManager: getPackageManager('pnpm'),
      });

      const storeDir = path.join(runDir, 'store');
      const installEnv = {
        npm_config_userconfig: registryFixture.consumerNpmrcPath,
        CI: 'true',
      };
      const installArgs = [
        'pnpm',
        'install',
        '--no-frozen-lockfile',
        '--store-dir',
        storeDir,
      ];
      try {
        await runIsolated(installArgs, { cwd: appDir, env: installEnv });
      } catch (error) {
        if (!isSeededVersionMismatch(error, artifacts)) {
          throw error;
        }
        print(
          `First install failed on a source package version mismatch, retrying with exact overrides:\n${String(
            error,
          )}`,
        );
        await addExactOverrides(appDir, artifacts);
        await runIsolated(installArgs, { cwd: appDir, env: installEnv });
      }

      await runIsolated(
        ['pnpm', 'install', '--frozen-lockfile', '--store-dir', storeDir],
        { cwd: appDir, env: installEnv },
      );
      await runIsolated(['pnpm', 'tsc'], { cwd: appDir, env: installEnv });
      await runIsolated(['pnpm', 'build:backend'], {
        cwd: appDir,
        env: installEnv,
      });

      const skeleton = path.join(
        appDir,
        'packages/backend/dist/skeleton.tar.gz',
      );
      const bundle = path.join(appDir, 'packages/backend/dist/bundle.tar.gz');
      await expect(fs.pathExists(skeleton)).resolves.toBe(true);
      await expect(fs.pathExists(bundle)).resolves.toBe(true);

      const coverage = await verifyResolvedLockfile({
        lockfilePath: path.join(appDir, 'pnpm-lock.yaml'),
        registryUrl: registryFixture.url,
        artifacts,
        repositoryPackageNames: prepared.repositoryPackageNames,
      });
      // Only the packages in the generated app's own repository dependency
      // closure can appear in its lockfile. The always-packed bootstrap
      // closure also contains create-app and template-only packages.
      const appRepositoryNames = collectAppRepositoryNames(
        await PackageGraph.listTargetPackages(),
        await readAppRepositoryStartNames(appDir),
      );
      const expected = expectedArtifactCount(artifacts, appRepositoryNames);
      print(`Source artifact coverage: ${coverage.verified}/${expected}`);
      expect(coverage.verified).toBe(expected);
      expect(coverage.workspaceImporters).toContain('packages/backend');

      builder = await createOwnedBuilder(runId);
      const imageId = await builder.build({
        contextDir: appDir,
        dockerfile: path.join(appDir, 'packages/backend/Dockerfile'),
        npmrcPath: registryFixture.consumerNpmrcPath,
        iidFile: path.join(runDir, 'backend.iid'),
        logPath: path.join(runDir, 'backend-build.log'),
      });
      expect(imageId).toMatch(/^sha256:[0-9a-f]{64}$/);

      const versions = await readImageVersions({ imageId });
      print(`Built ${imageId}: node ${versions.node}, pnpm ${versions.pnpm}`);
      expect(versions.node).toBeTruthy();
      expect(versions.pnpm).toBeTruthy();
    } catch (error) {
      await captureDiagnostics({
        runDir: runDir ?? workRoot,
        registry,
        error,
      }).catch(() => {});
      throw error;
    } finally {
      await builder?.remove();
      await registry?.stop();
    }
  });

  it('fails the install when a required repository package is not seeded', async () => {
    let runDir: string | undefined;
    let registry: RegistryFixture | undefined;
    try {
      const closure = await prepareClosure();
      runDir = closure.runDir;
      const { prepared } = closure;
      const { artifacts } = prepared;

      const appDir = await createAppFromWorkspace({
        appName: 'negative-app',
        workspaceDir: prepared.bootstrapWorkspace,
        rootDir: runDir,
        packageManager: getPackageManager('pnpm'),
      });
      // Pin every available source package so that the only reason the install
      // can fail is the omitted package, not a generated range.
      await addExactOverrides(appDir, artifacts);
      const backendManifest = (await fs.readJson(
        path.join(appDir, 'packages/backend/package.json'),
      )) as { dependencies?: Record<string, string> };
      const publishedNames = new Set(
        artifacts
          .filter(
            artifact => artifact.private !== true && artifact.bundled !== true,
          )
          .map(artifact => artifact.name),
      );
      const omittedName = Object.keys(backendManifest.dependencies ?? {}).find(
        name => publishedNames.has(name),
      );
      expect(omittedName).toBeDefined();

      const registryFixture = await startRegistry({
        runId: `e2e-negative-${Date.now()}`,
        seededPackageNames: [...publishedNames].filter(
          name => name !== omittedName,
        ),
        repositoryPackageNames: prepared.repositoryPackageNames,
        image: REGISTRY_IMAGE,
        workDir: path.join(runDir, 'negative-registry'),
      });
      registry = registryFixture;

      await registryFixture.publish(
        artifacts.filter(artifact => artifact.name !== omittedName),
      );

      let installError: Error | undefined;
      try {
        await runIsolated(
          [
            'pnpm',
            'install',
            '--no-frozen-lockfile',
            '--store-dir',
            path.join(runDir, 'negative-store'),
          ],
          {
            cwd: appDir,
            env: {
              npm_config_userconfig: registryFixture.consumerNpmrcPath,
              CI: 'true',
            },
          },
        );
      } catch (error) {
        installError = error as Error;
      }

      expect(installError).toBeDefined();
      const withStreams = installError as Error & {
        stdout?: string;
        stderr?: string;
      };
      const output = `${withStreams.stdout ?? ''}\n${withStreams.stderr ?? ''}`;
      expect(output).toContain(omittedName!);
      expect(output).toMatch(/404|ERR_PNPM_FETCH_404/);
    } catch (error) {
      await captureDiagnostics({
        runDir: runDir ?? workRoot,
        registry,
        error,
        appName: 'negative-app',
      }).catch(() => {});
      throw error;
    } finally {
      await registry?.stop();
    }
  });
});

/**
 * A failed first install only qualifies for the exact-override retry when pnpm
 * reports a missing version for one of the captured source packages.
 */
function isSeededVersionMismatch(
  error: unknown,
  artifacts: readonly SourcePackageArtifact[],
): boolean {
  const { stdout = '', stderr = '' } = error as {
    stdout?: string;
    stderr?: string;
  };
  return `${stdout}\n${stderr}`
    .split('\n')
    .filter(line =>
      /ERR_PNPM_NO_MATCHING_VERSION|No matching version found/.test(line),
    )
    .some(line => artifacts.some(artifact => line.includes(artifact.name)));
}

/**
 * Pins every published source package to its captured version. Conflicting
 * pre-existing overrides are an error rather than being replaced.
 */
async function addExactOverrides(
  appDir: string,
  artifacts: readonly SourcePackageArtifact[],
): Promise<void> {
  const workspaceYamlPath = path.join(appDir, 'pnpm-workspace.yaml');
  const doc = parseDocument(await fs.readFile(workspaceYamlPath, 'utf8'));
  for (const artifact of artifacts) {
    if (artifact.private === true || artifact.bundled === true) {
      continue;
    }
    const existing = doc.getIn(['overrides', artifact.name]);
    if (existing !== undefined && existing !== artifact.version) {
      throw new Error(
        `Cannot override ${artifact.name} to ${artifact.version}, pnpm-workspace.yaml already overrides it with ${existing}`,
      );
    }
    doc.setIn(['overrides', artifact.name], artifact.version);
  }
  await fs.writeFile(workspaceYamlPath, doc.toString({ singleQuote: true }));
}

/**
 * Writes the failure, the registry log, and the generated configuration to a
 * directory that survives the run so that the gate workflow can upload it.
 */
async function captureDiagnostics(options: {
  runDir?: string;
  registry?: RegistryFixture;
  error: unknown;
  appName?: string;
}): Promise<void> {
  const destination = process.env.E2E_DIAGNOSTICS_DIR
    ? path.resolve(process.env.E2E_DIAGNOSTICS_DIR)
    : path.join(os.tmpdir(), `e2e-docker-diagnostics-${Date.now()}`);
  await fs.ensureDir(destination);

  const withStreams = options.error as Error & {
    stdout?: string;
    stderr?: string;
  };
  await fs.outputFile(
    path.join(destination, 'error.log'),
    [
      String(options.error),
      withStreams.stdout ? `\nstdout:\n${withStreams.stdout}` : '',
      withStreams.stderr ? `\nstderr:\n${withStreams.stderr}` : '',
    ].join(''),
  );

  if (options.registry) {
    await options.registry
      .captureLogs(path.join(destination, 'registry.log'))
      .catch(() => {});
  }

  if (options.runDir) {
    const appName = options.appName ?? 'test-app';
    for (const file of [
      'backend.iid',
      'backend-build.log',
      `${appName}/package.json`,
      `${appName}/pnpm-lock.yaml`,
      `${appName}/pnpm-workspace.yaml`,
      `${appName}/packages/backend/package.json`,
    ]) {
      const source = path.join(options.runDir, file);
      if (await fs.pathExists(source)) {
        await fs.copy(source, path.join(destination, file.replace(/\//g, '-')));
      }
    }
  }
  print(`Gate diagnostics written to ${destination}`);
}
