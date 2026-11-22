/*
 * Copyright 2025 The Backstage Authors
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

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** @internal */
export type SecretStore = {
  get(service: string, account: string): Promise<string | undefined>;
  set(service: string, account: string, secret: string): Promise<void>;
  delete(service: string, account: string): Promise<void>;
};

type Keyring = typeof import('@napi-rs/keyring');

// On Linux, only the Secret Service keeps secrets across reboots, and
// without one @napi-rs/keyring falls back to the kernel keyring. Require it,
// so that the file store is used instead when it isn't available.
const ENTRY_OPTIONS = { linux: { store: 'secret-service' as const } };

function createEntry(keyring: Keyring, service: string, account: string) {
  // keytar's target name on Windows, so that logins it stored keep working
  if (process.platform === 'win32') {
    return keyring.AsyncEntry.withTarget(
      `${service}/${account}`,
      service,
      account,
      ENTRY_OPTIONS,
    );
  }
  return new keyring.AsyncEntry(service, account, ENTRY_OPTIONS);
}

function loadKeyring(): Keyring | undefined {
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies, @backstage/no-undeclared-imports
    const keyring = require('@napi-rs/keyring') as Keyring;
    // Throws when the system credential store isn't available
    createEntry(keyring, 'backstage-cli', 'availability-check');
    return keyring;
  } catch {
    // @napi-rs/keyring or the system credential store isn't available
  }
  return undefined;
}

// Secrets are stored as UTF-8 bytes, as keytar stored them. Passwords would be
// stored as UTF-16 on Windows, which halves the length that fits.
class KeyringSecretStore implements SecretStore {
  private readonly keyring: Keyring;
  private readonly fileStore: SecretStore;
  constructor(keyring: Keyring, fileStore: SecretStore) {
    this.keyring = keyring;
    this.fileStore = fileStore;
  }
  async get(service: string, account: string): Promise<string | undefined> {
    const secret = await createEntry(
      this.keyring,
      service,
      account,
    ).getSecret();
    if (secret) {
      return Buffer.from(secret).toString('utf8');
    }
    // Earlier versions used files when keytar couldn't be loaded, so move a
    // secret that's still in one into the credential store.
    const legacySecret = await this.fileStore.get(service, account);
    if (legacySecret !== undefined) {
      try {
        await this.set(service, account, legacySecret);
      } catch {
        // Keep using the file until the credential store accepts it
      }
    }
    return legacySecret;
  }
  async set(service: string, account: string, secret: string): Promise<void> {
    await createEntry(this.keyring, service, account).setSecret(
      Buffer.from(secret, 'utf8'),
    );
    await this.fileStore.delete(service, account);
  }
  async delete(service: string, account: string): Promise<void> {
    await createEntry(this.keyring, service, account).deletePassword();
    await this.fileStore.delete(service, account);
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

class FileSecretStore implements SecretStore {
  private readonly baseDir: string;
  constructor() {
    const root =
      process.env.XDG_DATA_HOME ||
      (process.platform === 'win32'
        ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
        : path.join(os.homedir(), '.local', 'share'));
    this.baseDir = path.join(root, 'backstage-cli', 'auth-secrets');
  }
  private filePath(service: string, account: string): string {
    return path.join(
      this.baseDir,
      encodeURIComponent(service),
      `${encodeURIComponent(account)}.secret`,
    );
  }
  async get(service: string, account: string): Promise<string | undefined> {
    const file = this.filePath(service, account);
    if (!(await pathExists(file))) {
      return undefined;
    }
    return await fs.readFile(file, 'utf8');
  }
  async set(service: string, account: string, secret: string): Promise<void> {
    const file = this.filePath(service, account);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, secret, { encoding: 'utf8', mode: 0o600 });
  }
  async delete(service: string, account: string): Promise<void> {
    const file = this.filePath(service, account);
    try {
      await fs.unlink(file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }
}

let singleton: SecretStore | undefined;

/** @internal */
export async function getSecretStore(): Promise<SecretStore> {
  if (!singleton) {
    const keyring = loadKeyring();
    if (keyring) {
      singleton = new KeyringSecretStore(keyring, new FileSecretStore());
    } else {
      singleton = new FileSecretStore();
    }
  }
  return singleton;
}

/**
 * Reset the singleton instance (for testing purposes only)
 * @internal
 */
export function resetSecretStore(): void {
  singleton = undefined;
}
