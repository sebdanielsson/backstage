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

import { ForwardedError, NotFoundError } from '@backstage/errors';
import { run, runOutput, RunOptions, targetPaths } from '@backstage/cli-common';
import semver from 'semver';
import {
  PackageInfo,
  PackageManager,
  PackageManagerInstallOptions,
} from '../PackageManager';
import { Lockfile } from '../Lockfile';
import { PnpmLockfile } from './PnpmLockfile';

// The lowest pnpm version that the CLI supports
const MINIMUM_PNPM_VERSION = '12.4.0';

/**
 * The {@link PackageManager} implementation for pnpm.
 *
 * @remarks
 *
 * pnpm 12.4 or later is required. Creating an instance for an older version
 * fails with an error that names the minimum version.
 *
 * @public
 */
export class Pnpm implements PackageManager {
  /**
   * Creates a new instance by detecting the version of pnpm that is used in
   * the given directory, defaulting to the current working directory.
   */
  static async create(dir?: string): Promise<Pnpm> {
    const version = await detectPnpmVersion(dir);
    if (semver.lt(version, MINIMUM_PNPM_VERSION)) {
      throw new Error(
        `pnpm ${semver.major(MINIMUM_PNPM_VERSION)}.${semver.minor(
          MINIMUM_PNPM_VERSION,
        )} or later is required, found ${version}`,
      );
    }
    return new Pnpm(version);
  }

  private constructor(private readonly pnpmVersion: string) {}

  /** {@inheritDoc PackageManager.name} */
  name() {
    return 'pnpm';
  }

  /** {@inheritDoc PackageManager.version} */
  version() {
    return this.pnpmVersion;
  }

  /** {@inheritDoc PackageManager.lockfileName} */
  lockfileName(): string {
    return 'pnpm-lock.yaml';
  }

  /**
   * Runs `pnpm install`, with `--frozen-lockfile` when an immutable install is
   * requested and `--no-frozen-lockfile` when a mutable install is requested.
   * The latter is needed because pnpm enables frozen installs by default in
   * CI environments.
   */
  async install(options?: PackageManagerInstallOptions) {
    const { immutable, cwd, env, onStdout, onStderr } = options ?? {};

    const args = ['install'];
    if (immutable === true) {
      args.push('--frozen-lockfile');
    } else if (immutable === false) {
      args.push('--no-frozen-lockfile');
    }

    await this.run(args, { cwd, env, onStdout, onStderr });
  }

  /** {@inheritDoc PackageManager.run} */
  async run(args: string[], options?: RunOptions) {
    await run(['pnpm', ...args], options).waitForExit();
  }

  /** Runs `pnpm run <script> [args]`. */
  async runScript(script: string, args: string[] = [], options?: RunOptions) {
    await this.run(['run', script, ...args], options);
  }

  /** Runs `pnpm --filter <workspace> run <script> [args]`. */
  async runWorkspaceScript(
    workspace: string,
    script: string,
    args: string[] = [],
    options?: RunOptions,
  ) {
    await this.run(['--filter', workspace, 'run', script, ...args], options);
  }

  /** Runs `pnpm pack --out <output>` in the package directory. */
  async pack(output: string, packageDir: string, options?: RunOptions) {
    await this.run(['pack', '--out', output], {
      ...options,
      cwd: packageDir,
    });
  }

  /**
   * Fetches package information using `pnpm view`.
   *
   * @remarks
   *
   * A {@link @backstage/errors#NotFoundError} is thrown when the package does
   * not exist in the registry.
   */
  async fetchPackageInfo(name: string): Promise<PackageInfo> {
    let output: string;
    try {
      output = await runOutput(['pnpm', 'view', name, '--json']);
    } catch (error) {
      if (
        error instanceof Error &&
        'stdout' in error &&
        typeof error.stdout === 'string' &&
        error.stdout.includes('ERR_PNPM_FETCH_404')
      ) {
        throw new NotFoundError(
          `No package information found for package ${name}`,
        );
      }

      throw error;
    }

    if (!output) {
      throw new NotFoundError(
        `No package information found for package ${name}`,
      );
    }

    const info = JSON.parse(output) as PackageInfo & {
      error?: { code?: string; message?: string };
    };
    if (info.error) {
      if (info.error.code === 'ERR_PNPM_FETCH_404') {
        throw new NotFoundError(
          `No package information found for package ${name}`,
        );
      }
      throw new Error(
        `Failed to fetch package information for ${name}, ${
          info.error.message ?? info.error.code
        }`,
      );
    }

    return {
      name: info.name,
      'dist-tags': info['dist-tags'],
      versions: info.versions,
      time: info.time,
    };
  }

  /** Loads the `pnpm-lock.yaml` file in the root of the target project. */
  async loadLockfile(): Promise<Lockfile> {
    return PnpmLockfile.load(targetPaths.resolveRoot(this.lockfileName()));
  }

  /**
   * Parses the given `pnpm-lock.yaml` contents, using the root of the target
   * project to find the names of the workspace projects in the lockfile.
   */
  async parseLockfile(contents: string): Promise<Lockfile> {
    return PnpmLockfile.parse(contents, { workspaceDir: targetPaths.rootDir });
  }

  /**
   * Always `false`, since the 'backstage:^' version protocol is only
   * available through the Backstage Yarn plugin.
   */
  async supportsBackstageVersionProtocol(): Promise<boolean> {
    return false;
  }

  /** {@inheritDoc PackageManager.getCommandHint} */
  getCommandHint(args: string[]): string {
    return ['pnpm', ...args].join(' ');
  }

  /** {@inheritDoc PackageManager.toString} */
  toString(): string {
    return `${this.name()}@${this.pnpmVersion}`;
  }
}

const versions = new Map<string, Promise<string>>();

function detectPnpmVersion(dir?: string): Promise<string> {
  const cwd = dir ?? process.cwd();
  if (versions.has(cwd)) {
    return versions.get(cwd)!;
  }

  const promise = Promise.resolve().then(async () => {
    try {
      const stdout = await runOutput(['pnpm', '--version'], { cwd });
      const version = stdout.trim();
      if (!semver.valid(version)) {
        throw new Error(`Unexpected output from 'pnpm --version': ${stdout}`);
      }
      return version;
    } catch (error) {
      throw new ForwardedError('Failed to determine pnpm version', error);
    }
  });

  versions.set(cwd, promise);
  // A failed version check is not cached, so that the next attempt runs again
  promise.catch(() => {
    versions.delete(cwd);
  });
  return promise;
}
