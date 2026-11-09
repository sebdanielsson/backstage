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

import type { BackstagePackage } from '@backstage/cli-node';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  collectAppRepositoryNames,
  expectedArtifactCount,
  readAppRepositoryStartNames,
} from './appClosure';
import type { SourcePackageArtifact } from './distWorkspace';

function pkg(
  name: string,
  packageJson: Record<string, unknown>,
): BackstagePackage {
  return {
    dir: `/tmp/${name}`,
    packageJson: {
      name,
      version: '1.0.0',
      ...packageJson,
    } as BackstagePackage['packageJson'],
  };
}

function artifact(
  name: string,
  extra: Partial<SourcePackageArtifact> = {},
): SourcePackageArtifact {
  return {
    name,
    version: '1.0.0',
    sourceCommit: 'fixture',
    archivePath: `/fixtures/${name}.tgz`,
    integrity: 'sha512-fixture',
    ...extra,
  };
}

describe('collectAppRepositoryNames', () => {
  const packages = [
    pkg('a', {
      dependencies: { b: '^1.0.0' },
      devDependencies: { c: '^1.0.0' },
    }),
    pkg('b', { dependencies: { d: '^1.0.0' } }),
    pkg('c', { dependencies: { e: '^1.0.0' } }),
    pkg('d', { bundled: true, dependencies: { f: '^1.0.0' } }),
    pkg('e', {}),
    pkg('f', {}),
  ];

  it('follows published dependencies and stops at bundled packages', () => {
    expect(collectAppRepositoryNames(packages, ['a'])).toEqual(
      new Set(['a', 'b', 'd']),
    );
  });

  it('rejects start names that are not repository packages', () => {
    expect(() => collectAppRepositoryNames(packages, ['missing'])).toThrow(
      "Package 'missing' not found",
    );
  });
});

describe('readAppRepositoryStartNames', () => {
  it('collects the Backstage names from the generated app manifests', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-app-'));
    try {
      await fs.outputJson(path.join(dir, 'package.json'), {
        dependencies: { '@backstage/cli': '^1', react: '^18' },
        devDependencies: { '@backstage/e2e-test-utils': '^1' },
      });
      await fs.outputJson(path.join(dir, 'packages/app/package.json'), {
        dependencies: { '@backstage/core-components': '^1' },
      });
      await fs.outputJson(path.join(dir, 'packages/backend/package.json'), {
        dependencies: { '@backstage/backend-defaults': '^1' },
        optionalDependencies: { '@backstage/optional': '^1' },
      });

      const names = await readAppRepositoryStartNames(dir);
      expect(names.sort()).toEqual([
        '@backstage/backend-defaults',
        '@backstage/cli',
        '@backstage/core-components',
        '@backstage/e2e-test-utils',
        '@backstage/optional',
      ]);
    } finally {
      await fs.remove(dir);
    }
  });
});

describe('expectedArtifactCount', () => {
  it('counts the published artifacts in the app closure only', () => {
    const artifacts = [
      artifact('in-closure'),
      artifact('in-closure-private', { private: true }),
      artifact('in-closure-bundled', { bundled: true }),
      artifact('outside-closure'),
    ];
    const appRepositoryNames = new Set([
      'in-closure',
      'in-closure-private',
      'in-closure-bundled',
    ]);

    expect(expectedArtifactCount(artifacts, appRepositoryNames)).toBe(1);
  });
});
