/*
 * Copyright 2024 The Backstage Authors
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

import { Yarn } from './yarn';
import { Lockfile } from './Lockfile';
import { targetPaths } from '@backstage/cli-common';
import { RunOnOutput, RunOptions } from '@backstage/cli-common';
import fs from 'fs-extra';
import { resolve as resolvePath } from 'node:path';

/**
 * Package info retrieved from the package manager, usually from NPM.
 *
 * @public
 */
export type PackageInfo = {
  name: string;
  'dist-tags': Record<string, string>;
  versions: string[];
  time: { [version: string]: string };
};

/**
 * Options for {@link PackageManager.install}.
 *
 * @public
 */
export type PackageManagerInstallOptions = {
  /**
   * Whether the lockfile must not be modified by the install. When set to
   * `false`, the install is allowed to modify the lockfile even in environments
   * where the package manager would otherwise refuse to, such as CI. When not
   * set, the package manager's own default applies, which for both Yarn and
   * pnpm means immutable installs in CI and mutable installs elsewhere.
   */
  immutable?: boolean;

  /** The directory to run the install in. Defaults to the current working directory. */
  cwd?: string;

  /** Additional environment variables to pass to the package manager. */
  env?: Partial<NodeJS.ProcessEnv>;

  /** Called with each chunk of output written to stdout by the package manager. */
  onStdout?: RunOnOutput;

  /** Called with each chunk of output written to stderr by the package manager. */
  onStderr?: RunOnOutput;
};

/**
 * Represents the package manager in use by this instance of Backstage. This
 * interface allows Backstage adopters to change the package manager used by
 * their repo and still use the Backstage CLI, and it's helpful tooling.
 *
 * @public
 */
export interface PackageManager {
  /** The name of the package manager, for example `yarn`. */
  name(): string;

  /** The self-reported version of the package manager. */
  version(): string;

  /** The file name of the lockfile used by the package manager, for example `yarn.lock`. */
  lockfileName(): string;

  /** Uses the package manager to run a command in the repo. */
  run(args: string[], options?: RunOptions): Promise<void>;

  /**
   * Runs the given `package.json` script through the package manager, with
   * any additional arguments forwarded to the script.
   */
  runScript(
    script: string,
    args?: string[],
    options?: RunOptions,
  ): Promise<void>;

  /**
   * Runs the given `package.json` script of a specific workspace package
   * through the package manager, with any additional arguments forwarded to
   * the script.
   */
  runWorkspaceScript(
    workspace: string,
    script: string,
    args?: string[],
    options?: RunOptions,
  ): Promise<void>;

  /**
   * Installs the dependencies of the repo. See
   * {@link PackageManagerInstallOptions} for how to control whether the
   * lockfile may be modified.
   */
  install(options?: PackageManagerInstallOptions): Promise<void>;

  /**
   * Executes the package manager's pack command to bundle the package in
   * `packageDir` into an archive written to `output`. Any `options` are
   * forwarded to the pack process, except that `cwd` is always `packageDir`.
   */
  pack(output: string, packageDir: string, options?: RunOptions): Promise<void>;

  /** Fetches information about the given package, usually from NPM. */
  fetchPackageInfo(name: string): Promise<PackageInfo>;

  /** Reads the lockfile from the root of the repo. See {@link Lockfile} */
  loadLockfile(): Promise<Lockfile>;

  /** Parses the given string as a {@link Lockfile}. */
  parseLockfile(contents: string): Promise<Lockfile>;

  /**
   * Whether the package manager supports the 'backstage:^' version protocol.
   */
  supportsBackstageVersionProtocol(): Promise<boolean>;

  /**
   * Returns the command that a user would type in their terminal to run the
   * given arguments through the package manager, for example `yarn fix`.
   * Intended for use in messages to the user.
   */
  getCommandHint(args: string[]): string;

  /** A string representation of the package manager. */
  toString(): string;
}

const detectedPackageManagers = new Map<string, Promise<PackageManager>>();

/**
 * Detects the package manager that is used by the target project.
 *
 * @remarks
 *
 * The package manager is detected from the root of the project, in the
 * following order:
 *
 * 1. The `packageManager` field in the root `package.json`, when it names a
 *    supported package manager.
 * 2. A `pnpm-lock.yaml` file: pnpm.
 * 3. A `yarn.lock` file: Yarn.
 * 4. A `pnpm-workspace.yaml` file: pnpm.
 * 5. A `workspaces` field in the root `package.json`: Yarn.
 * 6. Otherwise Yarn, with a warning.
 *
 * A project that declares a package manager is taken at its word, so that a
 * lockfile left behind by another package manager does not decide which one
 * the commands use. A project with both lockfiles gets a warning. A project
 * that declares an unsupported package manager and gives no other signal
 * fails, rather than having a Yarn lockfile written into it.
 *
 * The result is cached per project root.
 *
 * @public
 */
export async function detectPackageManager(): Promise<PackageManager> {
  const rootDir = targetPaths.rootDir;

  let detected = detectedPackageManagers.get(rootDir);
  if (!detected) {
    detected = detectPackageManagerInDir(rootDir).catch(error => {
      detectedPackageManagers.delete(rootDir);
      throw error;
    });
    detectedPackageManagers.set(rootDir, detected);
  }

  return detected;
}

/**
 * Clears the cache of detected package managers. Only intended for tests.
 *
 * @internal
 */
export function resetDetectedPackageManagers(): void {
  detectedPackageManagers.clear();
}

async function detectPackageManagerInDir(
  rootDir: string,
): Promise<PackageManager> {
  const packageJson = await readPackageJson(rootDir);

  const declaredPacman = packageJson?.packageManager;
  const declaredName =
    typeof declaredPacman === 'string'
      ? declaredPacman.split('@')[0]
      : undefined;

  // What the project declares wins over the files in the root, so that a
  // lockfile that another package manager left behind does not decide which
  // package manager the commands use.
  if (declaredName === 'yarn') {
    return Yarn.create(rootDir);
  }
  if (declaredName === 'pnpm') {
    return createPnpm(rootDir);
  }

  const unsupported =
    declaredName === undefined
      ? undefined
      : `The packageManager field of the project declares ${declaredName}, which is not supported.`;
  // An unsupported declaration does not decide anything, but the project
  // should know that it was ignored.
  const warnIgnoredDeclaration = () => {
    if (unsupported) {
      console.warn(`${unsupported} Detecting from the project files instead.`);
    }
  };

  const hasPnpmLockfile = await fileExists(
    resolvePath(rootDir, 'pnpm-lock.yaml'),
  );
  const hasYarnLockfile = await fileExists(resolvePath(rootDir, 'yarn.lock'));

  if (hasPnpmLockfile && hasYarnLockfile) {
    console.warn(
      'Both pnpm-lock.yaml and yarn.lock exist in the project root, using pnpm. ' +
        'Remove the lockfile that the project does not use, or set the ' +
        'packageManager field of the root package.json.',
    );
  }

  if (hasPnpmLockfile) {
    warnIgnoredDeclaration();
    return createPnpm(rootDir);
  }

  if (hasYarnLockfile) {
    warnIgnoredDeclaration();
    return Yarn.create(rootDir);
  }

  if (await fileExists(resolvePath(rootDir, 'pnpm-workspace.yaml'))) {
    warnIgnoredDeclaration();
    return createPnpm(rootDir);
  }

  if (packageJson?.workspaces) {
    // technically this could be NPM as well
    warnIgnoredDeclaration();
    return Yarn.create(rootDir);
  }

  if (unsupported) {
    // Falling back to Yarn here would write a Yarn lockfile into a project
    // that picked a different package manager.
    throw new Error(
      `${unsupported} Use yarn or pnpm, or remove the field so that the package manager is detected from the project.`,
    );
  }

  // currently yarn is the only package manager supported so just log an error and use it anyway
  console.warn(
    'Yarn was not detected, but is the only supported package manager.',
  );
  return Yarn.create(rootDir);
}

// pnpm is not supported yet, so any detection of it falls back to yarn
async function createPnpm(rootDir: string): Promise<PackageManager> {
  console.warn('Detected unsupported package manager: pnpm.');
  return Yarn.create(rootDir);
}

async function readPackageJson(
  rootDir: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    return await fs.readJson(resolvePath(rootDir, 'package.json'));
  } catch (error) {
    console.warn(`Error during package manager detection: ${error}`);
    return undefined;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}
