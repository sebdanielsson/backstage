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

import { run, runOutput, RunOnOutput } from '@backstage/cli-common';
import { PackageManager } from '@backstage/cli-node';
import chalk from 'chalk';
import fs from 'fs-extra';
import {
  basename,
  isAbsolute,
  join as joinPath,
  relative as relativePath,
  resolve as resolvePath,
  sep as pathSep,
} from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createStepLogger, showLogOnError } from './stepLogger';

type StepLogger = ReturnType<typeof createStepLogger>;

/**
 * The steps of the bundle command that depend on the package manager of the
 * source project. The bundle is a project of its own, so each package manager
 * has its own way of turning the bundle directory into a project root,
 * carrying over dependency overrides, and pruning and installing the lockfile.
 */
export interface BundlePackageManagerSteps {
  /**
   * Establishes the bundle directory as its own project root, so that the
   * seeded lockfile is the one the package manager reads and writes even when
   * the output directory is inside another monorepo. Runs before anything is
   * packed into the bundle.
   */
  prepareBundleDir(options: {
    targetDir: string;
    rootDir: string;
    rootPkg: Record<string, any>;
  }): Promise<void>;

  /**
   * Reads the dependency overrides of the source project root, which are
   * merged into the overrides of the bundle.
   */
  readRootOverrides(options: {
    rootDir: string;
    rootPkg: Record<string, any>;
  }): Promise<Record<string, string> | undefined>;

  /**
   * Stores the merged overrides of the bundle where the package manager reads
   * them. On entry they are in the `resolutions` field of `targetPkg`, which
   * is written to the bundle `package.json` afterwards. May also add other
   * fields to `targetPkg` that the package manager needs in the bundle.
   */
  writeOverrides(options: {
    targetDir: string;
    rootDir: string;
    rootPkg: Record<string, any>;
    targetPkg: Record<string, unknown>;
  }): Promise<void>;

  /**
   * Prunes the seeded lockfile of the bundle down to the entries that its
   * `package.json` still needs. The step runs offline first. The pnpm
   * implementation retries with network access for the entries that the
   * local cache lacks.
   */
  pruneLockfile(options: {
    targetDir: string;
    rootDir: string;
    verbose: boolean;
  }): Promise<void>;

  /**
   * Installs the dependencies of the bundle from the pruned lockfile into a
   * private `node_modules`, without modifying the lockfile.
   */
  installDependencies(options: {
    targetDir: string;
    verbose: boolean;
  }): Promise<void>;

  /** Removes files that the install left behind outside of `node_modules`. */
  cleanupAfterInstall(targetDir: string): Promise<void>;
}

/**
 * Returns the bundle steps for the package manager of the source project.
 */
export function getBundlePackageManagerSteps(
  pm: PackageManager,
): BundlePackageManagerSteps {
  switch (pm.name()) {
    case 'yarn':
      return createYarnSteps(pm);
    case 'pnpm':
      return createPnpmSteps(pm);
    default:
      throw new Error(
        `The package bundle command does not support the ${pm.name()} package manager`,
      );
  }
}

/**
 * Captures the output of a step in a log file that is shown on failure and
 * removed on success.
 */
async function runLoggedStep(
  logFilePath: string,
  verbose: boolean,
  prefix: string,
  step: (log: StepLogger) => Promise<void>,
): Promise<void> {
  const log = createStepLogger(logFilePath, verbose, prefix);
  try {
    await step(log);
  } catch (err) {
    await log.close();
    await showLogOnError(log.path, verbose);
    throw err;
  }
  await log.close();
  await fs.remove(log.path);
}

// ── Yarn ─────────────────────────────────────────────────────────────────

function createYarnSteps(pm: PackageManager): BundlePackageManagerSteps {
  return {
    async prepareBundleDir({ targetDir, rootDir, rootPkg }) {
      const yarnrcLines = ['nodeLinker: node-modules'];
      try {
        // Include yarnPath so the same Yarn version that created the lockfile
        // is used for pruning/installing -- lockfile formats differ across
        // major Yarn versions (e.g. ~builtin vs optional!builtin patches).
        const resolved = await runOutput(
          ['yarn', 'config', 'get', 'yarnPath'],
          { cwd: rootDir },
        );
        const yarnPathSentinels = new Set(['undefined', 'null']);
        if (resolved && !yarnPathSentinels.has(resolved)) {
          yarnrcLines.push(`yarnPath: ${resolved}`);
        }
      } catch {
        // yarnPath not configured — check if corepack manages the version instead
        if (!rootPkg.packageManager) {
          console.warn(
            chalk.yellow(
              'No yarnPath configured and no packageManager field found. ' +
                'The Yarn version in PATH will be used for lockfile operations.',
            ),
          );
        }
      }

      await fs.writeFile(
        joinPath(targetDir, '.yarnrc.yml'),
        `${yarnrcLines.join('\n')}\n`,
      );
    },

    async readRootOverrides({ rootPkg }) {
      return rootPkg?.resolutions;
    },

    async writeOverrides() {
      // Yarn reads the merged overrides from the `resolutions` field of the
      // bundle package.json, where they already are.
    },

    async pruneLockfile({ targetDir, rootDir, verbose }) {
      const sourceCacheFolder = await runOutput(
        ['yarn', 'config', 'get', 'cacheFolder'],
        { cwd: rootDir },
      );

      await runLoggedStep(
        joinPath(targetDir, 'lockfile-prune.log'),
        verbose,
        '[lockfile-prune] ',
        async pruneLog => {
          await run(
            ['yarn', 'install', '--no-immutable', '--mode', 'update-lockfile'],
            {
              cwd: targetDir,
              env: {
                YARN_ENABLE_GLOBAL_CACHE: 'false',
                YARN_ENABLE_NETWORK: '0',
                YARN_ENABLE_MIRROR: 'false',
                YARN_CACHE_FOLDER: sourceCacheFolder,
              },
              onStdout: pruneLog.logRunOutput('out'),
              onStderr: pruneLog.logRunOutput('err'),
            },
          ).waitForExit();
        },
      );
    },

    async installDependencies({ targetDir, verbose }) {
      await runLoggedStep(
        joinPath(targetDir, 'yarn-install.log'),
        verbose,
        '[yarn-install] ',
        async installLog => {
          await pm.install({
            immutable: true,
            cwd: targetDir,
            onStdout: installLog.logRunOutput('out'),
            onStderr: installLog.logRunOutput('err'),
          });
        },
      );
    },

    async cleanupAfterInstall(targetDir) {
      // Clean up .yarn directory created during install
      const yarnDir = joinPath(targetDir, '.yarn');
      if (await fs.pathExists(yarnDir)) {
        await fs.remove(yarnDir);
      }
    },
  };
}

// ── pnpm ─────────────────────────────────────────────────────────────────

/**
 * Settings of the source `pnpm-workspace.yaml` that the bundle copies. The
 * store and cache settings make the offline steps find what the install in the
 * source project put there: `minimumReleaseAge` and `resolutionMode` select
 * between separate metadata caches. `allowBuilds` carries the build script
 * policy, so native dependencies are built in the bundle as they are in the
 * source project.
 *
 * The rest change what the lockfile resolves to. pnpm records them in the
 * lockfile and re-resolves the seeded one when they do not match, which drops
 * the dependencies that the source project resolved with them. It does so
 * without an error, so a bundle built without them is quietly wrong.
 */
const PNPM_SETTINGS_TO_COPY = [
  'storeDir',
  'cacheDir',
  'minimumReleaseAge',
  'minimumReleaseAgeExclude',
  'resolutionMode',
  'allowBuilds',
  'packageExtensions',
  'peerDependencyRules',
  'ignoredOptionalDependencies',
  'supportedArchitectures',
  'autoInstallPeers',
  'excludeLinksFromLockfile',
  'dedupePeerDependents',
  'catalog',
  'catalogs',
];

const PNPM_PATH_SETTINGS = new Set(['storeDir', 'cacheDir']);

/** Settings that the bundle sets itself, or handles separately. */
const PNPM_SETTINGS_SET_BY_BUNDLE = new Set([
  // The bundle is a single package, not the workspace of the source project
  'packages',
  // The bundle always uses the flat layout that Yarn produces
  'nodeLinker',
  // Merged with the resolutions of the plugin and written from those
  'overrides',
  // Copied together with the patch files it points at
  'patchedDependencies',
]);

/**
 * Settings that cannot change what the bundle installs. They describe the
 * workspace layout of the source project, which the bundle does not have, or
 * they only affect how the package manager is used during development. The
 * hoisting patterns are in this group because the bundle picks its own linker.
 */
const PNPM_SETTINGS_WITHOUT_EFFECT_ON_BUNDLE = new Set([
  'hoistPattern',
  'publicHoistPattern',
  'shamefullyHoist',
  'modulesDir',
  'virtualStoreDir',
  'virtualStoreDirMaxLength',
  'sharedWorkspaceLockfile',
  'linkWorkspacePackages',
  'preferWorkspacePackages',
  'saveWorkspaceProtocol',
  'injectWorkspacePackages',
  'ignoreWorkspaceRootCheck',
  'recursiveInstall',
  'strictPeerDependencies',
  'enablePrePostScripts',
  'verifyDepsBeforeRun',
  'managePackageManagerVersions',
  'updateNotifier',
]);

/**
 * Copies the patch files of the source project into the bundle and returns a
 * `patchedDependencies` setting that points at the copies. A patch that is
 * inside the source project keeps its path, so that two patch files with the
 * same name do not collide.
 */
async function copyPnpmPatches(options: {
  rootDir: string;
  targetDir: string;
  patchedDependencies: Record<string, unknown>;
}): Promise<Record<string, string>> {
  const { rootDir, targetDir, patchedDependencies } = options;

  const copied: Record<string, string> = {};
  for (const [name, value] of Object.entries(patchedDependencies)) {
    if (typeof value !== 'string') {
      continue;
    }
    const patchPath = isAbsolute(value) ? value : resolvePath(rootDir, value);
    if (!(await fs.pathExists(patchPath))) {
      console.warn(
        chalk.yellow(
          `The patch file for ${chalk.cyan(name)} was not found at ${chalk.cyan(
            patchPath,
          )}, the bundle will not be patched`,
        ),
      );
      continue;
    }
    const fromRoot = relativePath(rootDir, patchPath);
    const bundlePath =
      fromRoot && !fromRoot.startsWith('..') && !isAbsolute(fromRoot)
        ? fromRoot
        : joinPath('patches', basename(patchPath));
    await fs.copy(patchPath, joinPath(targetDir, bundlePath));
    copied[name] = bundlePath.split(pathSep).join('/');
  }
  return copied;
}

async function readPnpmWorkspaceConfig(
  rootDir: string,
): Promise<Record<string, unknown>> {
  const configPath = joinPath(rootDir, 'pnpm-workspace.yaml');
  if (!(await fs.pathExists(configPath))) {
    return {};
  }
  const parsed = parseYaml(await fs.readFile(configPath, 'utf8'));
  return parsed && typeof parsed === 'object' ? parsed : {};
}

/**
 * Matches the output of pnpm when its cache lacks the metadata or tarball for
 * a package in an offline install, by error code or by message since pnpm
 * drops the code when it wraps the error. The output is matched with
 * collapsed whitespace, because pnpm wraps long messages across lines.
 */
const pnpmOfflineErrorPattern =
  /ERR_PNPM_NO_OFFLINE_|in package mirror|cannot download it in offline mode/;

/**
 * Runs a pnpm step with `--offline`. When pnpm reports that its cache lacks
 * the metadata or tarball for a package, the step is retried once with
 * `--prefer-offline`, which still uses the cache for everything it has.
 */
async function runPnpmOfflineStep(
  log: StepLogger,
  description: string,
  step: (
    mode: '--offline' | '--prefer-offline',
    output: { onStdout: RunOnOutput; onStderr: RunOnOutput },
  ) => Promise<void>,
): Promise<void> {
  const chunks: string[] = [];
  const capture =
    (forward: RunOnOutput): RunOnOutput =>
    data => {
      chunks.push(data.toString('utf8'));
      forward(data);
    };
  const output = {
    onStdout: capture(log.logRunOutput('out')),
    onStderr: capture(log.logRunOutput('err')),
  };

  try {
    await step('--offline', output);
    return;
  } catch (error) {
    const collapsed = chunks.join('').replace(/\s+/g, ' ');
    if (!pnpmOfflineErrorPattern.test(collapsed)) {
      throw error;
    }
  }

  console.warn(
    chalk.yellow(
      `The pnpm cache does not have everything needed for an offline ${description}, ` +
        `retrying with ${chalk.cyan('--prefer-offline')}...`,
    ),
  );
  await step('--prefer-offline', output);
}

function createPnpmSteps(pm: PackageManager): BundlePackageManagerSteps {
  return {
    async prepareBundleDir() {
      // The bundle pnpm-workspace.yaml is written together with the overrides
      // once those are known, which is before pnpm first runs in the bundle.
    },

    async readRootOverrides({ rootDir }) {
      const { overrides } = await readPnpmWorkspaceConfig(rootDir);
      if (!overrides || typeof overrides !== 'object') {
        return undefined;
      }
      return Object.fromEntries(
        Object.entries(overrides).filter(
          ([, value]) => typeof value === 'string',
        ),
      );
    },

    async writeOverrides({ targetDir, rootDir, rootPkg, targetPkg }) {
      const rootConfig = await readPnpmWorkspaceConfig(rootDir);

      // The bundle may be written outside the source project, where the
      // `packageManager` pin of the source root is not found. Carry it over
      // so that Corepack and pnpm itself use the pnpm version that created
      // the seeded lockfile.
      if (
        typeof rootPkg.packageManager === 'string' &&
        rootPkg.packageManager.startsWith('pnpm@')
      ) {
        targetPkg.packageManager = rootPkg.packageManager;
      }

      // Establish the bundle directory as its own pnpm workspace root, with
      // the same flat node_modules layout that Yarn produces.
      const config: Record<string, unknown> = { nodeLinker: 'hoisted' };
      for (const key of PNPM_SETTINGS_TO_COPY) {
        const value = rootConfig[key];
        if (value === undefined) {
          continue;
        }
        if (PNPM_PATH_SETTINGS.has(key) && typeof value === 'string') {
          // Relative paths are relative to the source project root
          config[key] =
            isAbsolute(value) || value.startsWith('~')
              ? value
              : resolvePath(rootDir, value);
        } else {
          config[key] = value;
        }
      }

      // A patch is applied through a file, so the files come along with the
      // setting that names them.
      const patchedDependencies = rootConfig.patchedDependencies;
      if (patchedDependencies && typeof patchedDependencies === 'object') {
        const copied = await copyPnpmPatches({
          rootDir,
          targetDir,
          patchedDependencies: patchedDependencies as Record<string, unknown>,
        });
        if (Object.keys(copied).length > 0) {
          config.patchedDependencies = copied;
        }
      }

      // pnpm ignores the `resolutions` field, so the merged overrides go
      // into the workspace file instead.
      const overrides = targetPkg.resolutions as
        | Record<string, string>
        | undefined;
      delete targetPkg.resolutions;
      if (overrides && Object.keys(overrides).length > 0) {
        config.overrides = overrides;
      }

      // A setting that is neither carried nor known to be irrelevant may
      // change what the bundle installs, so say so rather than let the
      // difference pass unnoticed.
      const notCarried = Object.keys(rootConfig).filter(
        key =>
          !PNPM_SETTINGS_TO_COPY.includes(key) &&
          !PNPM_SETTINGS_SET_BY_BUNDLE.has(key) &&
          !PNPM_SETTINGS_WITHOUT_EFFECT_ON_BUNDLE.has(key),
      );
      if (notCarried.length > 0) {
        console.warn(
          chalk.yellow(
            `These pnpm settings of the project are not carried into the bundle: ${chalk.cyan(
              notCarried.join(', '),
            )}. If the bundle resolves dependencies differently than the ` +
              `project, this is the first place to look.`,
          ),
        );
      }

      await fs.writeFile(
        joinPath(targetDir, 'pnpm-workspace.yaml'),
        stringifyYaml(config),
      );
    },

    async pruneLockfile({ targetDir, verbose }) {
      await runLoggedStep(
        joinPath(targetDir, 'lockfile-prune.log'),
        verbose,
        '[lockfile-prune] ',
        async pruneLog => {
          await runPnpmOfflineStep(
            pruneLog,
            'lockfile prune',
            async (mode, output) => {
              // The seeded lockfile belongs to another project, so the prune
              // must be able to rewrite it even where pnpm defaults to a
              // frozen lockfile, such as in CI.
              await pm.run(
                ['install', '--lockfile-only', '--no-frozen-lockfile', mode],
                { cwd: targetDir, ...output },
              );
            },
          );
        },
      );
    },

    async installDependencies({ targetDir, verbose }) {
      await runLoggedStep(
        joinPath(targetDir, 'pnpm-install.log'),
        verbose,
        '[pnpm-install] ',
        async installLog => {
          await runPnpmOfflineStep(
            installLog,
            'install',
            async (mode, output) => {
              if (mode === '--offline') {
                await pm.install({
                  immutable: true,
                  offline: true,
                  cwd: targetDir,
                  ...output,
                });
              } else {
                await pm.run(['install', '--frozen-lockfile', mode], {
                  cwd: targetDir,
                  ...output,
                });
              }
            },
          );
        },
      );
    },

    async cleanupAfterInstall() {
      // pnpm keeps its install state inside node_modules, in the same way
      // that Yarn keeps node_modules/.yarn-state.yml, and leaves nothing
      // behind outside of it.
    },
  };
}
