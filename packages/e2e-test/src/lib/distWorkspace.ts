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
import path from 'node:path';
import { createHash } from 'node:crypto';
import handlebars from 'handlebars';
import * as tar from 'tar';
import { findOwnPaths, runOutput } from '@backstage/cli-common';
import { PackageGraph } from '@backstage/cli-node';
import { print } from './helpers';

/* eslint-disable-next-line no-restricted-syntax */
const ownPaths = findOwnPaths(__dirname);

const templatePackagePaths = [
  'packages/cli-module-new/templates/frontend-plugin/package.json.hbs',
  'packages/create-app/templates/default-app/package.json.hbs',
  'packages/create-app/templates/default-app/packages/app/package.json.hbs',
  'packages/create-app/templates/default-app/packages/backend/package.json.hbs',
];

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

// Ranges with these protocols only resolve inside the repository and cannot be
// installed from the registry.
const REPOSITORY_PROTOCOLS = [
  'workspace:',
  'backstage:',
  'link:',
  'file:',
  'patch:',
];

/**
 * A packed package from the repository that is published to the fixture
 * registry instead of being resolved from the public registry.
 */
export type SourcePackageArtifact = {
  name: string;
  version: string;
  sourceCommit: string;
  archivePath: string;
  integrity: string;
  private?: boolean;
  bundled?: boolean;
};

/**
 * The always-packed workspace that bootstraps registry tests, together with
 * the packages that were captured from it.
 */
export type PreparedArtifacts = {
  bootstrapWorkspace: string;
  repositoryPackageNames: ReadonlySet<string>;
  artifacts: readonly SourcePackageArtifact[];
};

type PackageManifest = {
  name?: string;
  version?: string;
  private?: boolean;
  bundled?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

/**
 * Builds the argument list for the `build-workspace` command of the CLI.
 */
export function buildWorkspaceArgs(options: {
  workspaceDir: string;
  packageNames: readonly string[];
  alwaysPack: boolean;
}): string[] {
  return [
    'yarn',
    'backstage-cli',
    'build-workspace',
    ...(options.alwaysPack ? ['--always-pack'] : []),
    options.workspaceDir,
    ...options.packageNames,
  ];
}

/**
 * Builds a dist workspace that contains the cli and core packages.
 */
export async function buildDistWorkspace(options: {
  workspaceName: string;
  rootDir: string;
  alwaysPack: boolean;
  beforeInstall?: (workspaceDir: string) => Promise<void>;
}): Promise<string> {
  const workspaceDir = path.resolve(options.rootDir, options.workspaceName);
  await fs.ensureDir(workspaceDir);

  // We grab the needed dependencies from the create app template
  const createAppDeps = new Set<string>();

  function appendDeps(pkg: any) {
    Array<string>()
      .concat(
        Object.keys(pkg.dependencies ?? {}),
        Object.keys(pkg.devDependencies ?? {}),
        Object.keys(pkg.peerDependencies ?? {}),
      )
      .filter(name => name.startsWith('@backstage/'))
      .forEach(dep => createAppDeps.add(dep));
  }

  for (const pkgJsonPath of templatePackagePaths) {
    const jsonPath = ownPaths.resolveRoot(pkgJsonPath);
    const pkgTemplate = await fs.readFile(jsonPath, 'utf8');
    const pkg = JSON.parse(
      handlebars.compile(pkgTemplate)(
        {
          privatePackage: true,
          scopeName: '@backstage',
        },
        {
          helpers: {
            version(name: string) {
              // Ignore non Backstage packages
              if (!name.startsWith('@backstage/')) {
                return '^0.0.0';
              }
              const pkge = require(`${name}/package.json`);
              if (!pkge) {
                throw new Error(`No version available for package ${name}`);
              }
              return pkge.version;
            },
            versionQuery(name: string, hint: string) {
              // Ignore non Backstage packages
              if (!name.startsWith('@backstage/')) {
                return '^0.0.0';
              }
              const pkgData = require(`${name}/package.json`);
              if (!pkgData) {
                if (typeof hint !== 'string') {
                  throw new Error(`No version available for package ${name}`);
                }
                return `^${hint}`;
              }
              return `^${pkgData.version}`;
            },
          },
        },
      ),
    );
    appendDeps(pkg);
  }

  // eslint-disable-next-line @backstage/no-forbidden-package-imports
  appendDeps(require('@backstage/create-app/package.json'));

  print(`Preparing workspace`);
  await runOutput(
    buildWorkspaceArgs({
      workspaceDir,
      packageNames: ['@backstage/create-app', ...createAppDeps],
      alwaysPack: options.alwaysPack,
    }),
  );

  print('Pinning yarn version in workspace');
  await pinYarnVersion(workspaceDir);

  const yarnPatchesPath = ownPaths.resolveRoot('.yarn/patches');
  if (await fs.pathExists(yarnPatchesPath)) {
    print('Copying yarn patches');
    await fs.copy(yarnPatchesPath, path.resolve(workspaceDir, '.yarn/patches'));
  }

  if (options.beforeInstall) {
    await options.beforeInstall(workspaceDir);
  }

  print('Installing workspace dependencies');
  await runOutput(['yarn', 'workspaces', 'focus', '--all', '--production'], {
    cwd: workspaceDir,
  });

  return workspaceDir;
}

/**
 * Packs every package in a dist workspace and records its integrity, so that
 * the packages can be published to the fixture registry.
 */
export async function captureSourcePackages(options: {
  workspaceDir: string;
  targetDir: string;
  sourceCommit: string;
}): Promise<SourcePackageArtifact[]> {
  const manifests: { dir: string; path: string; manifest: PackageManifest }[] =
    [];
  for (const workspacePackageDir of ['packages', 'plugins']) {
    const packageDirs = path.resolve(options.workspaceDir, workspacePackageDir);
    if (!(await fs.pathExists(packageDirs))) {
      continue;
    }
    for (const dir of (await fs.readdir(packageDirs)).sort()) {
      const manifestPath = path.join(packageDirs, dir, 'package.json');
      if (!(await fs.pathExists(manifestPath))) {
        continue;
      }
      manifests.push({
        dir: path.dirname(manifestPath),
        path: manifestPath,
        manifest: await fs.readJson(manifestPath),
      });
    }
  }

  const seen = new Set<string>();
  for (const { path: manifestPath, manifest } of manifests) {
    const { name, version } = manifest;
    if (!name || !version) {
      throw new Error(`missing name or version in ${manifestPath}`);
    }
    const id = `${name}@${version}`;
    if (seen.has(id)) {
      throw new Error(`duplicate source package ${id}`);
    }
    seen.add(id);

    for (const field of DEPENDENCY_FIELDS) {
      for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
        if (
          typeof range === 'string' &&
          REPOSITORY_PROTOCOLS.some(protocol => range.startsWith(protocol))
        ) {
          throw new Error(
            `unsupported repository protocol in ${name} ${field}.${dep}: ${range}`,
          );
        }
      }
    }
  }

  await fs.ensureDir(options.targetDir);
  const artifacts: SourcePackageArtifact[] = [];
  for (const { dir, manifest } of manifests) {
    const { name, version } = manifest as { name: string; version: string };
    const archivePath = path.resolve(
      options.targetDir,
      `${name.replace(/^@/, '').replace(/\//g, '-')}-${version}.tgz`,
    );
    await tar.create(
      {
        file: archivePath,
        cwd: dir,
        gzip: true,
        portable: true,
        noMtime: true,
        prefix: 'package/',
      },
      ['.'],
    );
    const integrity = `sha512-${createHash('sha512')
      .update(await fs.readFile(archivePath))
      .digest('base64')}`;

    artifacts.push({
      name,
      version,
      sourceCommit: options.sourceCommit,
      archivePath,
      integrity,
      ...(manifest.private === true && { private: true }),
      ...(manifest.bundled === true && { bundled: true }),
    });
  }

  await fs.outputJson(
    path.resolve(options.targetDir, 'source-packages.json'),
    artifacts,
    { spaces: 2 },
  );

  return artifacts;
}

/**
 * Builds the always-packed workspace and captures the packages from it before
 * the bootstrap install, which would otherwise add node_modules to the archives.
 */
export async function prepareSourceArtifacts(options: {
  rootDir: string;
  artifactsDir: string;
  sourceCommit: string;
}): Promise<PreparedArtifacts> {
  let artifacts: SourcePackageArtifact[] = [];
  const bootstrapWorkspace = await buildDistWorkspace({
    workspaceName: 'workspace',
    rootDir: options.rootDir,
    alwaysPack: true,
    beforeInstall: async workspaceDir => {
      artifacts = await captureSourcePackages({
        workspaceDir,
        targetDir: options.artifactsDir,
        sourceCommit: options.sourceCommit,
      });
    },
  });

  const packages = await PackageGraph.listTargetPackages();
  return {
    bootstrapWorkspace,
    repositoryPackageNames: repositoryPackageNames(packages),
    artifacts,
  };
}

/**
 * Returns the names of all packages in the repository.
 */
export function repositoryPackageNames(
  packages: readonly { packageJson: { name: string } }[],
): ReadonlySet<string> {
  return new Set(packages.map(pkg => pkg.packageJson.name));
}

/**
 * Pin the yarn version in a directory to the one we're using in the Backstage repo
 */
export async function pinYarnVersion(dir: string) {
  const yarnRc = await fs.readFile(ownPaths.resolveRoot('.yarnrc.yml'), 'utf8');
  const yarnRcLines = yarnRc.split(/\r?\n/);
  const yarnPathLine = yarnRcLines.find(line => line.startsWith('yarnPath:'));
  if (!yarnPathLine) {
    throw new Error(`Unable to find 'yarnPath' in ${yarnRc}`);
  }
  const match = yarnPathLine.match(/^yarnPath: (.*)$/);
  if (!match) {
    throw new Error(`Invalid 'yarnPath' in ${yarnRc}`);
  }
  const [, localYarnPath] = match;
  const yarnPath = ownPaths.resolveRoot(localYarnPath);
  const yarnPluginPath = ownPaths.resolveRoot(
    localYarnPath,
    '../../plugins/@yarnpkg/plugin-workspace-tools.cjs',
  );

  // Intentionally writes a minimal yarnrc rather than merging with the template's.
  // The create-app template enables `npmMinimalAgeGate`, which would block e2e runs
  // from validating freshly-published dependency bumps and ecosystem-fix releases.
  // New Yarn defaults must be set explicitly so install does not rewrite this file.
  await fs.writeFile(
    path.resolve(dir, '.yarnrc.yml'),
    `yarnPath: ${yarnPath}
nodeLinker: node-modules
enableGlobalCache: true
enableScripts: true
npmMinimalAgeGate: 0
approvedGitRepositories: []
plugins:
  - path: ${yarnPluginPath}
    spec: '@yarnpkg/plugin-workspace-tools'
`,
  );
}
