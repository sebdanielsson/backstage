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
import * as tar from 'tar';
import { stringify } from 'yaml';

const FIXTURE_TOKEN = 'e2e-fixture-token';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function normalizeRegistryUrl(registryUrl: string): string {
  return `${registryUrl.replace(/\/+$/, '')}/`;
}

export function buildRegistryConfig(options: {
  seededPackageNames: readonly string[];
  repositoryPackageNames: ReadonlySet<string>;
}): string {
  const seeded = new Set(options.seededPackageNames);
  const packages: Record<string, Record<string, string>> = {};
  for (const name of options.seededPackageNames) {
    packages[name] = { access: '$all', publish: '$all' };
  }
  for (const name of options.repositoryPackageNames) {
    if (!seeded.has(name)) {
      packages[name] = { access: '$all', publish: '$authenticated' };
    }
  }
  packages['**'] = {
    access: '$all',
    publish: '$authenticated',
    proxy: 'npmjs',
  };

  return stringify({
    storage: '/verdaccio/storage',
    auth: { htpasswd: { file: '/verdaccio/conf/htpasswd' } },
    uplinks: { npmjs: { url: 'https://registry.npmjs.org/' } },
    packages,
  });
}

export function buildConsumerNpmrc(registryUrl: string): string {
  return `registry=${normalizeRegistryUrl(registryUrl)}\n`;
}

export function buildPublisherNpmrc(registryUrl: string): string {
  const normalized = normalizeRegistryUrl(registryUrl);
  return (
    `registry=${normalized}\n` +
    `//${normalized.replace(/^https?:\/\//, '')}:_authToken=${FIXTURE_TOKEN}\n`
  );
}

/**
 * Guards the publication step: the fixture registry must be on the loopback
 * interface, and the archive must not be configured to publish anywhere else.
 */
export async function assertPublishTarget(
  archivePath: string,
  registryUrl: string,
): Promise<void> {
  const fixtureUrl = normalizeRegistryUrl(registryUrl);
  const hostname = new URL(fixtureUrl).hostname.replace(/^\[|\]$/g, '');
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new Error(`Refusing to publish to non-loopback registry ${hostname}`);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-publish-'));
  try {
    await tar.extract({ file: archivePath, cwd: tmpDir, strip: 1 });
    const pkg = (await fs.readJson(path.join(tmpDir, 'package.json'))) as {
      publishConfig?: { registry?: string };
    };
    const target = pkg.publishConfig?.registry;
    if (
      target !== undefined &&
      target !== fixtureUrl.replace(/\/$/, '') &&
      !target.startsWith(fixtureUrl)
    ) {
      throw new Error(
        `Refusing to publish ${path.basename(
          archivePath,
        )}: publishConfig.registry is ${target}, expected ${fixtureUrl}`,
      );
    }
  } finally {
    await fs.remove(tmpDir);
  }
}
