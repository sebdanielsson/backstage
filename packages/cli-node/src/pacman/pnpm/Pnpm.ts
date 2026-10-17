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
import fs from 'fs-extra';
import { resolve as resolvePath } from 'node:path';
import semver from 'semver';
import { parseDocument } from 'yaml';
import {
  PackageInfo,
  PackageManager,
  PackageManagerInstallOptions,
  ParseLockfileOptions,
} from '../PackageManager';
import { Lockfile } from '../Lockfile';
import { PnpmLockfile } from './PnpmLockfile';

// The lowest pnpm version that the CLI supports
const MINIMUM_PNPM_VERSION = '12.7.0';

/**
 * Options for {@link Pnpm.create}.
 *
 * @alpha
 */
export type PnpmCreateOptions = {
  /**
   * The root of the workspace that the instance is bound to. Defaults to the
   * workspace root of the current working directory.
   */
  workspaceRootDir?: string;
};

/**
 * The {@link PackageManager} implementation for pnpm.
 *
 * @remarks
 *
 * pnpm 12.7 or later is required. Creating an instance for an older version
 * fails with an error that names the minimum version.
 *
 * @alpha
 */
export class Pnpm implements PackageManager {
  /**
   * Creates an instance bound to a workspace root, using the version of pnpm
   * that runs in that directory.
   */
  static async create(options?: PnpmCreateOptions): Promise<Pnpm> {
    const workspaceRootDir =
      options?.workspaceRootDir ?? targetPaths.workspaceRootDir;
    const version = await detectPnpmVersion(workspaceRootDir);
    if (semver.lt(version, MINIMUM_PNPM_VERSION)) {
      throw new Error(
        `pnpm ${semver.major(MINIMUM_PNPM_VERSION)}.${semver.minor(
          MINIMUM_PNPM_VERSION,
        )} or later is required, found ${version}`,
      );
    }
    return new Pnpm(workspaceRootDir, version);
  }

  private constructor(
    private readonly workspaceRootDir: string,
    private readonly pnpmVersion: string,
  ) {}

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
   * Runs `pnpm install` in the workspace root. An immutable install uses
   * `--frozen-lockfile`, and a mutable one `--no-frozen-lockfile`, since pnpm
   * enables frozen installs by default in CI. A `filter` limits the install to
   * the named packages and their dependencies.
   */
  async install(options?: PackageManagerInstallOptions) {
    const { immutable, offline, filter, env, onStdout, onStderr } =
      options ?? {};

    const args = ['install'];
    if (immutable === true) {
      args.push('--frozen-lockfile');
    } else if (immutable === false) {
      args.push('--no-frozen-lockfile');
    }
    if (offline) {
      args.push('--offline');
    }
    for (const name of filter ?? []) {
      args.push('--filter', `${name}...`);
    }

    await this.run(args, {
      env: {
        // We filter out all of the npm_* environment variables that are added when
        // executing through a package manager. This works around an issue where these
        // variables incorrectly override local config in the project directory.
        ...Object.fromEntries(
          Object.entries(process.env).map(([name, value]) =>
            name.startsWith('npm_') ? [name, undefined] : [name, value],
          ),
        ),
        ...env,
      },
      onStdout,
      onStderr,
    });
  }

  /** {@inheritDoc PackageManager.run} */
  async run(args: string[], options?: RunOptions) {
    await run(['pnpm', ...args], {
      ...options,
      cwd: options?.cwd ?? this.workspaceRootDir,
    }).waitForExit();
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
   * Fetches package information using `pnpm view`. A NotFoundError is thrown
   * when the package does not exist in the registry.
   */
  async fetchPackageInfo(name: string): Promise<PackageInfo> {
    let output: string;
    try {
      output = await runOutput(['pnpm', 'view', name, '--json'], {
        cwd: this.workspaceRootDir,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        'stdout' in error &&
        typeof error.stdout === 'string' &&
        /ERR_PNPM_FETCH_404|E404/.test(error.stdout)
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

  /**
   * Loads the `pnpm-lock.yaml` file in the workspace root. The names of the
   * workspace packages are read from the same workspace.
   */
  async loadLockfile(): Promise<Lockfile> {
    return PnpmLockfile.load(
      resolvePath(this.workspaceRootDir, this.lockfileName()),
      {
        readWorkspacePackageJson: async dir => {
          try {
            return await fs.readJson(
              resolvePath(this.workspaceRootDir, dir, 'package.json'),
            );
          } catch {
            return undefined;
          }
        },
      },
    );
  }

  /**
   * Parses the given `pnpm-lock.yaml` contents. The workspace packages are
   * only named when `options.readWorkspacePackageJson` is given.
   */
  async parseLockfile(
    contents: string,
    options?: ParseLockfileOptions,
  ): Promise<Lockfile> {
    return PnpmLockfile.parse(contents, options);
  }

  /**
   * Always `false`, since the 'backstage:^' version protocol is only
   * available through the Backstage Yarn plugin.
   */
  async supportsBackstageVersionProtocol(): Promise<boolean> {
    return false;
  }

  /**
   * Reads the catalogs from `pnpm-workspace.yaml` in the workspace root. The
   * `catalog` field is the `default` catalog.
   */
  async readCatalogs(): Promise<Record<string, Record<string, string>>> {
    const doc = await this.readWorkspaceDocument();
    const data = (doc?.toJS() ?? {}) as {
      catalog?: Record<string, string>;
      catalogs?: Record<string, Record<string, string>>;
    };
    return {
      ...(data.catalog ? { default: data.catalog } : {}),
      ...data.catalogs,
    };
  }

  /**
   * Sets dependency versions in a catalog in `pnpm-workspace.yaml`, keeping
   * the rest of the file as it is.
   */
  async updateCatalog(
    name: string,
    versions: Record<string, string>,
  ): Promise<void> {
    const doc = await this.readWorkspaceDocument();

    let path: string[] | undefined;
    if (name === 'default' && doc?.has('catalog')) {
      path = ['catalog'];
    } else if (doc?.hasIn(['catalogs', name])) {
      path = ['catalogs', name];
    }
    if (!doc || !path) {
      throw new Error(
        `The catalog '${name}' does not exist in pnpm-workspace.yaml`,
      );
    }

    for (const [dependency, version] of Object.entries(versions)) {
      doc.setIn([...path, dependency], version);
    }
    await fs.writeFile(this.workspaceFilePath(), doc.toString());
  }

  /** {@inheritDoc PackageManager.getCommandHint} */
  getCommandHint(args: string[]): string {
    return ['pnpm', ...args].join(' ');
  }

  /** {@inheritDoc PackageManager.toString} */
  toString(): string {
    return `${this.name()}@${this.pnpmVersion}`;
  }

  private workspaceFilePath() {
    return resolvePath(this.workspaceRootDir, 'pnpm-workspace.yaml');
  }

  private async readWorkspaceDocument() {
    let content: string;
    try {
      content = await fs.readFile(this.workspaceFilePath(), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
    const doc = parseDocument(content);
    if (doc.errors.length > 0) {
      throw new Error(
        `Failed to parse pnpm-workspace.yaml, ${doc.errors[0].message}`,
      );
    }
    return doc;
  }
}

const versions = new Map<string, Promise<string>>();

function detectPnpmVersion(dir: string): Promise<string> {
  if (versions.has(dir)) {
    return versions.get(dir)!;
  }

  const promise = Promise.resolve().then(async () => {
    try {
      const stdout = await runOutput(['pnpm', '--version'], { cwd: dir });
      const version = stdout.trim();
      if (!semver.valid(version)) {
        throw new Error(`Unexpected output from 'pnpm --version': ${stdout}`);
      }
      return version;
    } catch (error) {
      throw new ForwardedError('Failed to determine pnpm version', error);
    }
  });

  versions.set(dir, promise);
  // A failed version check is not cached, so that the next attempt runs again
  promise.catch(() => {
    versions.delete(dir);
  });
  return promise;
}
