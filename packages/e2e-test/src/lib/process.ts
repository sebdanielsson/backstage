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

import { spawn } from 'node:child_process';

const ISOLATED_ENV_KEYS = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'SHELL',
  'TERM',
  'USER',
  'LOGNAME',
  'NODE_OPTIONS',
  'DOCKER_HOST',
  'DOCKER_CONFIG',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'all_proxy',
] as const;

/**
 * Builds an environment for a child process that can't see the caller's npm
 * configuration or credentials, while keeping what builds need.
 */
export function buildIsolatedEnv(
  overrides: Record<string, string> = {},
): NodeJS.ProcessEnv {
  // NODE_ENV is required by the repo-wide ProcessEnv augmentation
  const env = {} as NodeJS.ProcessEnv;
  for (const key of ISOLATED_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return { ...env, ...overrides };
}

/**
 * Runs a command in an isolated environment, returning its stdout. On failure
 * the error carries both the stdout and the stderr of the command.
 */
export function runIsolated(
  args: string[],
  options: {
    cwd: string;
    env?: Record<string, string>;
    onStdout?: (chunk: string) => void;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const [command, ...commandArgs] = args;
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: buildIsolatedEnv(options.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      const error = new Error(
        `Command failed with exit code ${code}: ${args.join(' ')}\n` +
          `stdout:\n${stdout}\nstderr:\n${stderr}`,
      ) as Error & { stdout: string; stderr: string };
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}
