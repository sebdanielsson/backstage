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
import type { SourcePackageArtifact } from './distWorkspace';
import { verifyResolvedLockfile } from './packageRegistry';

const FIXTURE_LOCKFILE = path.resolve(
  __dirname,
  '../../../cli-node/src/pacman/pnpm/__fixtures__/pinned/pnpm-lock.yaml',
);

function artifact(
  name: string,
  version: string,
  integrity: string,
): SourcePackageArtifact {
  return {
    name,
    version,
    sourceCommit: 'fixture',
    archivePath: `/fixtures/${name}-${version}.tgz`,
    integrity,
  };
}

describe('verifyResolvedLockfile', () => {
  const registryUrl = 'http://127.0.0.1:4873';
  const repositoryPackageNames = new Set(['is-number', 'is-odd', 'react-dom']);
  const artifacts = [
    artifact(
      'is-number',
      '6.0.0',
      'sha512-Wu1VHeILBK8KAWJUAiSZQX94GmOE45Rg6/538fKwiloUu21KncEkYGPqob2oSZ5mUT73vLGrHQjKw3KMPwfDzg==',
    ),
    artifact(
      'is-number',
      '7.0.0',
      'sha512-41Cifkg6e8TylSpdtTpeLVMqvSBEVzTttHvERD741+pnZ8ANv0004MRL43QKPDlK9cGvNp6NZWZUBlbGXYxxng==',
    ),
    artifact(
      'is-odd',
      '3.0.1',
      'sha512-CQpnWPrDwmP1+SMHXZhtLtJv90yiyVfluGsX5iNCVkrhQtU3TQHsUWPG9wkdk9Lgd5yNpAg9jQEo90CBaXgWMA==',
    ),
    artifact(
      'react-dom',
      '18.3.1',
      'sha512-5m4nQKp+rZRb09LNH59GM4BxTh9251/ylbKIbpe7TpGxfJ+9kv6BLkLBXIjjspbgbnIBNqlI23tRnTWT0snUIw==',
    ),
  ];

  it('counts every repository entry in a pinned v9 lockfile', async () => {
    await expect(
      verifyResolvedLockfile({
        lockfilePath: FIXTURE_LOCKFILE,
        registryUrl,
        artifacts,
        repositoryPackageNames,
      }),
    ).resolves.toEqual({
      verified: 4,
      workspaceImporters: ['.', 'packages/a', 'packages/b'],
    });
  });

  it('throws for missing artifacts and integrity mismatches', async () => {
    await expect(
      verifyResolvedLockfile({
        lockfilePath: FIXTURE_LOCKFILE,
        registryUrl,
        artifacts: artifacts.filter(a => a.name !== 'is-odd'),
        repositoryPackageNames,
      }),
    ).rejects.toThrow('no seeded artifact for is-odd@3.0.1');

    await expect(
      verifyResolvedLockfile({
        lockfilePath: FIXTURE_LOCKFILE,
        registryUrl,
        artifacts: artifacts.map(a =>
          a.name === 'is-odd' ? { ...a, integrity: 'sha512-wrong' } : a,
        ),
        repositoryPackageNames,
      }),
    ).rejects.toThrow('integrity mismatch for is-odd@3.0.1');
  });

  it('rejects pre-v9 lockfiles and tarballs outside the fixture registry', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-lockfile-'));
    try {
      const legacy = path.join(dir, 'legacy.yaml');
      await fs.writeFile(
        legacy,
        "lockfileVersion: '6.0'\nimporters: {}\npackages: {}\n",
      );
      await expect(
        verifyResolvedLockfile({
          lockfilePath: legacy,
          registryUrl,
          artifacts,
          repositoryPackageNames,
        }),
      ).rejects.toThrow("version '6.0'");

      const tarball = path.join(dir, 'tarball.yaml');
      await fs.writeFile(
        tarball,
        [
          "lockfileVersion: '9.0'",
          'importers:',
          '  .: {}',
          'packages:',
          '  is-odd@3.0.1:',
          '    resolution:',
          `      integrity: ${JSON.stringify(artifacts[2].integrity)}`,
          '      tarball: https://registry.npmjs.org/is-odd/-/is-odd-3.0.1.tgz',
          'snapshots:',
          '  is-odd@3.0.1: {}',
          '',
        ].join('\n'),
      );
      await expect(
        verifyResolvedLockfile({
          lockfilePath: tarball,
          registryUrl,
          artifacts,
          repositoryPackageNames,
        }),
      ).rejects.toThrow('outside the fixture registry');
    } finally {
      await fs.remove(dir);
    }
  });
});
