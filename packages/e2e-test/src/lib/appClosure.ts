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

import { PackageGraph } from '@backstage/cli-node';
import type { BackstagePackage } from '@backstage/cli-node';
import fs from 'fs-extra';
import path from 'node:path';
import type { SourcePackageArtifact } from './distWorkspace';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

/**
 * Collects the Backstage package names that the generated app requests from
 * its root, app, and backend manifests.
 */
export async function readAppRepositoryStartNames(
  appDir: string,
): Promise<string[]> {
  const names = new Set<string>();
  for (const manifestPath of [
    'package.json',
    'packages/app/package.json',
    'packages/backend/package.json',
  ]) {
    const manifest = await fs.readJson(path.join(appDir, manifestPath));
    for (const field of DEPENDENCY_FIELDS) {
      for (const name of Object.keys(manifest[field] ?? {})) {
        if (name.startsWith('@backstage/')) {
          names.add(name);
        }
      }
    }
  }
  return [...names];
}

/**
 * Resolves the repository packages that the generated app installs from the
 * registry: the start packages plus their published local dependencies.
 * Bundled packages do not contribute dependencies of their own.
 */
export function collectAppRepositoryNames(
  packages: readonly BackstagePackage[],
  startNames: readonly string[],
): Set<string> {
  const graph = PackageGraph.fromPackages([...packages]);
  return graph.collectPackageNames([...startNames], node =>
    node.packageJson.bundled
      ? undefined
      : node.publishedLocalDependencies.keys(),
  );
}

/**
 * Counts the artifacts that the generated app must resolve from the registry:
 * published (non-private, non-bundled) packages in the app's repository
 * dependency closure.
 */
export function expectedArtifactCount(
  artifacts: readonly SourcePackageArtifact[],
  appRepositoryNames: ReadonlySet<string>,
): number {
  return artifacts.filter(
    artifact =>
      appRepositoryNames.has(artifact.name) &&
      artifact.private !== true &&
      artifact.bundled !== true,
  ).length;
}
