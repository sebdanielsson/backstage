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

import { createMockDirectory } from '@backstage/backend-test-utils';
import { getSecretStore, resetSecretStore } from './secretStore';

// Secrets by entry name, as the bytes the store was given
const mockSecrets = new Map<string, Buffer>();
const mockEntryOptions: unknown[] = [];
let mockStoreAvailable = true;

jest.mock('@napi-rs/keyring', () => {
  class MockAsyncEntry {
    static withTarget(
      target: string,
      service: string,
      account: string,
      options: unknown,
    ) {
      return new MockAsyncEntry(service, account, options, target);
    }
    private readonly name: string;
    constructor(
      service: string,
      account: string,
      options: unknown,
      target?: string,
    ) {
      if (!mockStoreAvailable) {
        throw new Error('Secret Service is not available');
      }
      mockEntryOptions.push(options);
      this.name = target ? `target:${target}` : `${service}|${account}`;
    }
    async getSecret() {
      const secret = mockSecrets.get(this.name);
      return secret ? Array.from(secret) : null;
    }
    async setSecret(secret: Uint8Array) {
      mockSecrets.set(this.name, Buffer.from(secret));
    }
    async deletePassword() {
      return mockSecrets.delete(this.name);
    }
  }
  return { AsyncEntry: MockAsyncEntry };
});

const service = 'backstage-cli:auth-instance:a';
const secretDir = `backstage-cli/auth-secrets/${encodeURIComponent(service)}`;

const mockDir = createMockDirectory();

describe('getSecretStore', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    mockDir.clear();
    mockSecrets.clear();
    mockEntryOptions.length = 0;
    mockStoreAvailable = true;
    process.env.XDG_DATA_HOME = mockDir.path;
    resetSecretStore();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    delete process.env.XDG_DATA_HOME;
    resetSecretStore();
  });

  it('keeps secrets in the system credential store as UTF-8', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const store = await getSecretStore();

    await store.set(service, 'accessToken', 'tökén');
    expect(mockSecrets.get(`${service}|accessToken`)).toEqual(
      Buffer.from('tökén', 'utf8'),
    );
    await expect(store.get(service, 'accessToken')).resolves.toBe('tökén');

    await store.delete(service, 'accessToken');
    await expect(store.get(service, 'accessToken')).resolves.toBeUndefined();
    await expect(store.delete(service, 'accessToken')).resolves.toBeUndefined();

    expect(mockEntryOptions).not.toHaveLength(0);
    for (const options of mockEntryOptions) {
      expect(options).toEqual({ linux: { store: 'secret-service' } });
    }
    expect(mockDir.content()).toEqual({});
  });

  it("uses keytar's entry names on Windows", async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mockSecrets.set(
      `target:${service}/accessToken`,
      Buffer.from('from-keytar', 'utf8'),
    );
    const store = await getSecretStore();

    await expect(store.get(service, 'accessToken')).resolves.toBe(
      'from-keytar',
    );
    await store.set(service, 'refreshToken', 'refresh');
    expect([...mockSecrets.keys()]).toEqual([
      `target:${service}/accessToken`,
      `target:${service}/refreshToken`,
    ]);
  });

  it('moves secrets that earlier versions kept in files into the credential store', async () => {
    mockDir.setContent({
      [secretDir]: {
        'accessToken.secret': 'old-access',
        'refreshToken.secret': 'old-refresh',
      },
    });
    const store = await getSecretStore();

    await expect(store.get(service, 'accessToken')).resolves.toBe('old-access');
    expect(mockSecrets.get(`${service}|accessToken`)).toEqual(
      Buffer.from('old-access', 'utf8'),
    );
    expect(mockDir.content({ path: secretDir })).toEqual({
      'refreshToken.secret': expect.anything(),
    });

    // Logging out removes the file of a secret that was never read
    await store.delete(service, 'refreshToken');
    expect(mockDir.content({ path: secretDir })).toEqual({});
  });

  it('falls back to files when the system credential store is not available', async () => {
    mockStoreAvailable = false;
    const store = await getSecretStore();

    await store.set(service, 'accessToken', 'token');
    await expect(store.get(service, 'accessToken')).resolves.toBe('token');
    expect(mockSecrets.size).toBe(0);
    expect(
      mockDir.content({ path: secretDir, shouldReadAsText: true }),
    ).toEqual({ 'accessToken.secret': 'token' });
  });
});
