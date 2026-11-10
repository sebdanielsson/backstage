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

import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import { parse } from 'yaml';
import { runIsolated } from './process';

type GeneratedConfig = {
  packageManager: string;
  nodeLinker: string;
  minimumReleaseAge: number;
  minimumReleaseAgeExclude: string[];
  allowBuilds: Record<string, boolean>;
};

function requireField<T>(
  value: T | undefined,
  field: string,
  source: string,
): T {
  if (value === undefined) {
    throw new Error(`Missing ${field} in ${source}`);
  }
  return value;
}

/**
 * Reads the package manager pins and install policies from a generated app.
 */
export async function readGeneratedConfig(
  appDir: string,
): Promise<GeneratedConfig> {
  const packageJsonPath = path.join(appDir, 'package.json');
  const workspaceYamlPath = path.join(appDir, 'pnpm-workspace.yaml');
  const packageJson = (await fs.readJson(packageJsonPath)) as {
    packageManager?: string;
  };
  const workspace = (parse(await fs.readFile(workspaceYamlPath, 'utf8')) ??
    {}) as {
    nodeLinker?: string;
    minimumReleaseAge?: number;
    minimumReleaseAgeExclude?: string[];
    allowBuilds?: Record<string, boolean>;
  };

  return {
    packageManager: requireField(
      packageJson.packageManager,
      'packageManager',
      packageJsonPath,
    ),
    nodeLinker: requireField(
      workspace.nodeLinker,
      'nodeLinker',
      workspaceYamlPath,
    ),
    minimumReleaseAge: requireField(
      workspace.minimumReleaseAge,
      'minimumReleaseAge',
      workspaceYamlPath,
    ),
    minimumReleaseAgeExclude: requireField(
      workspace.minimumReleaseAgeExclude,
      'minimumReleaseAgeExclude',
      workspaceYamlPath,
    ),
    allowBuilds: requireField(
      workspace.allowBuilds,
      'allowBuilds',
      workspaceYamlPath,
    ),
  };
}

function consumerEnv(consumerNpmrcPath: string): Record<string, string> {
  return { npm_config_userconfig: consumerNpmrcPath, CI: 'true' };
}

/**
 * Installs the generated app against the fixture registry and reports the pnpm
 * version the app's package manager pin resolved to.
 */
export async function installApp(options: {
  appDir: string;
  consumerNpmrcPath: string;
  storeDir: string;
  frozen: boolean;
}): Promise<{ pnpmVersion: string }> {
  const env = consumerEnv(options.consumerNpmrcPath);
  await runIsolated(
    [
      'pnpm',
      'install',
      options.frozen ? '--frozen-lockfile' : '--no-frozen-lockfile',
      '--store-dir',
      options.storeDir,
    ],
    { cwd: options.appDir, env },
  );
  const pnpmVersion = (
    await runIsolated(['pnpm', '--version'], { cwd: options.appDir, env })
  ).trim();
  return { pnpmVersion };
}

/**
 * Type-checks the generated app and produces its backend deployment archives.
 */
export async function buildApp(options: {
  appDir: string;
  consumerNpmrcPath: string;
}): Promise<void> {
  const env = consumerEnv(options.consumerNpmrcPath);
  await runIsolated(['pnpm', 'tsc'], { cwd: options.appDir, env });
  await runIsolated(['pnpm', 'build:backend'], { cwd: options.appDir, env });
}

/**
 * Checks that the backend build produced everything the Docker image needs.
 */
export async function validateDeploymentArtifacts(appDir: string): Promise<{
  dockerfile: string;
  skeleton: string;
  bundle: string;
}> {
  const artifacts = {
    dockerfile: path.join(appDir, 'packages/backend/Dockerfile'),
    skeleton: path.join(appDir, 'packages/backend/dist/skeleton.tar.gz'),
    bundle: path.join(appDir, 'packages/backend/dist/bundle.tar.gz'),
  };
  for (const file of Object.values(artifacts)) {
    if (!(await fs.pathExists(file))) {
      throw new Error(`Missing deployment artifact: ${file}`);
    }
  }
  return artifacts;
}

/**
 * Returns the sha256 hex digest of a file's contents.
 */
export async function hashFile(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await fs.readFile(filePath))
    .digest('hex');
}
