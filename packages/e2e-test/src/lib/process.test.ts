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

import { buildIsolatedEnv, runIsolated } from './process';

describe('buildIsolatedEnv', () => {
  it('drops npm configuration and credentials but keeps the build environment', () => {
    const previous = process.env;
    try {
      process.env = {
        NODE_ENV: 'test',
        PATH: '/usr/bin',
        HOME: '/home/user',
        NODE_OPTIONS: '--max-old-space-size=8192',
        HTTP_PROXY: 'http://proxy:8080',
        npm_config_registry: 'https://registry.npmjs.org/',
        npm_config_userconfig: '/home/user/.npmrc',
        NODE_AUTH_TOKEN: 'secret',
        NPM_TOKEN: 'secret',
      } as NodeJS.ProcessEnv;

      const env = buildIsolatedEnv({
        npm_config_userconfig: '/tmp/fixture.npmrc',
      });

      expect(env).toEqual({
        PATH: '/usr/bin',
        HOME: '/home/user',
        NODE_OPTIONS: '--max-old-space-size=8192',
        HTTP_PROXY: 'http://proxy:8080',
        npm_config_userconfig: '/tmp/fixture.npmrc',
      });
    } finally {
      process.env = previous;
    }
  });
});

describe('runIsolated', () => {
  const cwd = process.cwd();

  it('returns stdout and forwards chunks to onStdout', async () => {
    const chunks: string[] = [];
    const stdout = await runIsolated(
      [process.execPath, '-e', 'process.stdout.write("hello")'],
      { cwd, onStdout: chunk => chunks.push(chunk) },
    );

    expect(stdout).toBe('hello');
    expect(chunks.join('')).toBe('hello');
  });

  it('rejects with both streams attached', async () => {
    let error: Error & { stdout?: string; stderr?: string };
    try {
      await runIsolated(
        [
          process.execPath,
          '-e',
          'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)',
        ],
        { cwd },
      );
      throw new Error('Expected runIsolated to reject');
    } catch (e) {
      error = e as Error & { stdout?: string; stderr?: string };
    }

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('exit code 3');
    expect(error.stdout).toBe('out');
    expect(error.stderr).toBe('err');
  });
});
