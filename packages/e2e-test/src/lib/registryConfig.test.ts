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
import { parse } from 'yaml';
import {
  assertPublishTarget,
  buildConsumerNpmrc,
  buildPublisherNpmrc,
  buildRegistryConfig,
} from './registryConfig';

describe('buildRegistryConfig', () => {
  it('keeps repository names local and only proxies the catch-all', () => {
    const config = parse(
      buildRegistryConfig({
        seededPackageNames: ['@backstage/plugin-a'],
        repositoryPackageNames: new Set([
          '@backstage/plugin-a',
          '@backstage/plugin-b',
          'e2e-test',
        ]),
      }),
    );

    expect(config.storage).toBe('/verdaccio/storage');
    expect(config.packages['@backstage/plugin-a']).toEqual({
      access: '$all',
      publish: '$all',
    });
    expect(config.packages['@backstage/plugin-b']).toEqual({
      access: '$all',
      publish: '$authenticated',
    });
    expect(config.packages['e2e-test']).toEqual({
      access: '$all',
      publish: '$authenticated',
    });
    expect(config.packages['**']).toEqual({
      access: '$all',
      publish: '$authenticated',
      proxy: 'npmjs',
    });
    expect(config.uplinks.npmjs.url).toBe('https://registry.npmjs.org/');
    expect(config.packages['@backstage/plugin-a'].proxy).toBeUndefined();
  });
});

describe('npmrc generation', () => {
  it('writes only the registry for consumers', () => {
    expect(buildConsumerNpmrc('http://127.0.0.1:4873')).toBe(
      'registry=http://127.0.0.1:4873/\n',
    );
  });

  it('adds the fixture token only for the publisher', () => {
    expect(buildPublisherNpmrc('http://127.0.0.1:4873')).toBe(
      'registry=http://127.0.0.1:4873/\n' +
        '//127.0.0.1:4873/:_authToken=e2e-fixture-token\n',
    );
    expect(buildConsumerNpmrc('http://127.0.0.1:4873')).not.toContain(
      '_authToken',
    );
  });
});

describe('assertPublishTarget', () => {
  const registryUrl = 'http://127.0.0.1:4873';

  async function createArchive(publishConfig?: object): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-registry-'));
    await fs.outputJson(path.join(dir, 'package', 'package.json'), {
      name: 'e2e-fixture',
      version: '1.0.0',
      ...(publishConfig ? { publishConfig } : {}),
    });
    const archivePath = path.join(dir, 'e2e-fixture.tgz');
    await tar.create({ file: archivePath, cwd: dir, gzip: true }, ['package']);
    return archivePath;
  }

  it('rejects archives configured to publish elsewhere', async () => {
    const archivePath = await createArchive({
      registry: 'https://registry.npmjs.org/',
    });

    await expect(assertPublishTarget(archivePath, registryUrl)).rejects.toThrow(
      'publishConfig.registry',
    );
  });

  it('accepts clean archives and archives targeting the fixture registry', async () => {
    await expect(
      assertPublishTarget(await createArchive(), registryUrl),
    ).resolves.toBeUndefined();
    await expect(
      assertPublishTarget(
        await createArchive({ registry: 'http://127.0.0.1:4873/' }),
        registryUrl,
      ),
    ).resolves.toBeUndefined();
  });

  it('refuses registries outside loopback', async () => {
    await expect(
      assertPublishTarget(await createArchive(), 'https://registry.npmjs.org/'),
    ).rejects.toThrow('loopback');
  });
});
