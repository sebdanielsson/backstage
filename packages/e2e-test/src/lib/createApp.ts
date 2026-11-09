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

import path from 'node:path';
import { run } from '@backstage/cli-common';
import { print, waitFor } from './helpers';
import { PackageManager } from './packageManager';

const CREATE_APP_PROMPT = 'Enter a name for the app';

/**
 * Returns the path to the create-app binary in a dist workspace.
 */
export function resolveCreateAppBinary(workspaceDir: string): string {
  return path.resolve(
    workspaceDir,
    'packages/create-app/bin/backstage-create-app',
  );
}

/**
 * Creates a new app from a dist workspace, leaving installation to the caller.
 */
export async function createAppFromWorkspace(options: {
  appName: string;
  workspaceDir: string;
  rootDir: string;
  packageManager: PackageManager;
}): Promise<string> {
  const { appName, workspaceDir, rootDir, packageManager } = options;
  const child = run(
    [
      'node',
      resolveCreateAppBinary(workspaceDir),
      '--skip-install',
      ...packageManager.createAppArgs(),
    ],
    {
      cwd: rootDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  try {
    let stdout = '';
    child.stdout?.on('data', data => {
      stdout = stdout + data.toString('utf8');
    });

    await waitFor(() => stdout.includes(CREATE_APP_PROMPT));
    child.stdin?.write(`${appName}\n`);

    print('Waiting for app create script to be done');
    await child.waitForExit();

    return path.resolve(rootDir, appName);
  } finally {
    child.kill();
  }
}
