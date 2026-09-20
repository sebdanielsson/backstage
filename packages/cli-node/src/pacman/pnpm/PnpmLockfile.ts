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

import { parseAllDocuments } from 'yaml';
import crypto from 'node:crypto';
import { posix as posixPath, dirname, join as joinPath } from 'node:path';
import fs from 'fs-extra';
import { Lockfile, LockfileDiff, LockfileEntry } from '../Lockfile';

// Matches `name@version` and `@scope/name@version`
const PACKAGE_KEY_PATTERN = /^(@[^/@]+\/[^/@]+|[^/@]+)@(.+)$/;

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
] as const;

type PnpmImporterDependency = {
  specifier: string;
  version: string;
};

type PnpmImporter = {
  [field in (typeof DEPENDENCY_FIELDS)[number]]?: Record<
    string,
    PnpmImporterDependency
  >;
};

type PnpmPackage = {
  resolution?: {
    integrity?: string;
  };
  peerDependencies?: Record<string, string>;
};

type PnpmSnapshot = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

type PnpmLockfileData = {
  lockfileVersion?: string | number;
  importers?: Record<string, PnpmImporter>;
  packages?: Record<string, PnpmPackage>;
  snapshots?: Record<string, PnpmSnapshot>;
};

/**
 * A resolved package or workspace project that entries point to. Packages are
 * keyed by their `packages` key, `name@version`, and workspace projects by
 * `importer:<dir>`.
 */
type PnpmNode = {
  version: string;
  integrity?: string;
  dependencies: Set<string>;
};

type PnpmEntry = LockfileEntry & {
  node?: string;
};

/**
 * Options for {@link PnpmLockfile.parse}.
 *
 * @public
 */
export type PnpmLockfileParseOptions = {
  /**
   * The directory of the workspace that the lockfile belongs to. When set, the
   * `package.json` of each workspace project listed in the lockfile is read to
   * find its name, so that the projects themselves are available as entries
   * in the lockfile.
   */
  workspaceDir?: string;
};

/**
 * Represents a pnpm `pnpm-lock.yaml` lockfile.
 *
 * @remarks
 *
 * Lockfile version 9 is supported, which is written by pnpm 9 and later.
 *
 * The ranges of direct dependencies are the specifiers from the `package.json`
 * files of the workspace projects, while transitive packages use their resolved
 * version as the range. Dependencies on other workspace projects have a `link:`
 * version with the directory of the linked project relative to the workspace
 * root, regardless of which project the dependency belongs to, so that equal
 * ranges of the same project are listed as a single entry. Workspace projects
 * themselves are listed under their package name, with a `workspace:<dir>`
 * range, when their name is known. The name is
 * read from the `package.json` in the workspace when parsing with a
 * `workspaceDir`, or found through the `link:` dependencies of other projects.
 *
 * @public
 */
export class PnpmLockfile implements Lockfile {
  /**
   * Load a {@link PnpmLockfile} from a file path. The directory of the file is
   * used as the workspace directory.
   */
  static async load(path: string): Promise<PnpmLockfile> {
    const lockfileContents = await fs.readFile(path, 'utf8');
    return PnpmLockfile.parse(lockfileContents, {
      workspaceDir: dirname(path),
    });
  }

  /**
   * Parse lockfile contents into a {@link PnpmLockfile}.
   *
   * @remarks
   *
   * When pnpm is pinned through the `packageManager` field, the lockfile is
   * written as multiple YAML documents, where the last one is the project
   * lockfile. The last document is always the one that is parsed.
   */
  static async parse(
    content: string,
    options?: PnpmLockfileParseOptions,
  ): Promise<PnpmLockfile> {
    const data = parseLockfileData(content);

    const nodes = new Map<string, PnpmNode>();
    const entries = new Map<string, PnpmEntry[]>();

    const addEntry = (name: string, entry: PnpmEntry) => {
      let nameEntries = entries.get(name);
      if (!nameEntries) {
        nameEntries = [];
        entries.set(name, nameEntries);
      }
      const exists = nameEntries.some(
        e => e.range === entry.range && e.version === entry.version,
      );
      if (!exists) {
        nameEntries.push(entry);
      }
    };

    // Packages, and their dependencies from the snapshots
    const packageNames = new Map<string, string>();
    for (const [key, pkg] of Object.entries(data.packages ?? {})) {
      const { name, version } = parsePackageKey(key);
      packageNames.set(key, name);
      nodes.set(key, {
        version,
        integrity: pkg?.resolution?.integrity,
        dependencies: new Set(Object.keys(pkg?.peerDependencies ?? {})),
      });
    }
    for (const [key, snapshot] of Object.entries(data.snapshots ?? {})) {
      const packageKey = stripPeerSuffix(key);
      let node = nodes.get(packageKey);
      if (!node) {
        const { name, version } = parsePackageKey(packageKey);
        packageNames.set(packageKey, name);
        node = { version, dependencies: new Set() };
        nodes.set(packageKey, node);
      }
      for (const depName of Object.keys(snapshot?.dependencies ?? {})) {
        node.dependencies.add(depName);
      }
      for (const depName of Object.keys(snapshot?.optionalDependencies ?? {})) {
        node.dependencies.add(depName);
      }
    }

    // Workspace projects
    const importers = data.importers ?? {};
    const importerNames = await findImporterNames(importers, options);

    for (const [dir, importer] of Object.entries(importers)) {
      const nodeKey = `importer:${dir}`;
      const node: PnpmNode = {
        version: `link:${dir}`,
        dependencies: new Set(),
      };
      nodes.set(nodeKey, node);

      for (const field of DEPENDENCY_FIELDS) {
        for (const [name, dep] of Object.entries(importer?.[field] ?? {})) {
          node.dependencies.add(name);

          const { version, node: depNode } = resolveImporterDependency(
            dir,
            name,
            dep,
            importers,
          );
          addEntry(name, { range: dep.specifier, version, node: depNode });
        }
      }

      const importerName = importerNames.get(dir);
      if (importerName) {
        addEntry(importerName, {
          range: `workspace:${dir}`,
          version: node.version,
          node: nodeKey,
        });
      }
    }

    // Transitive packages, using the resolved version as the range
    for (const [key, name] of packageNames) {
      const isDirect = entries.get(name)?.some(e => e.node === key);
      if (!isDirect) {
        addEntry(name, {
          range: nodes.get(key)!.version,
          version: nodes.get(key)!.version,
          node: key,
        });
      }
    }

    for (const nameEntries of entries.values()) {
      nameEntries.sort(
        (a, b) =>
          compareStrings(a.range, b.range) ||
          compareStrings(a.version, b.version),
      );
    }

    return new PnpmLockfile(entries, nodes);
  }

  private constructor(
    private readonly entries: Map<string, PnpmEntry[]>,
    private readonly nodes: Map<string, PnpmNode>,
  ) {}

  /** Get the entries for a single package in the lockfile */
  get(name: string): LockfileEntry[] | undefined {
    return this.entries
      .get(name)
      ?.map(({ range, version }) => ({ range, version }));
  }

  /** Returns the names of all packages available in the lockfile */
  keys(): IterableIterator<string> {
    return this.entries.keys();
  }

  /**
   * Creates a simplified dependency graph from the lockfile data, where each
   * key is a package, and the value is a set of all packages that it depends on
   * across all versions.
   */
  createSimplifiedDependencyGraph(): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    for (const [name, entries] of this.entries) {
      const dependencies = new Set(
        entries.flatMap(e => [...(this.getNode(e)?.dependencies ?? [])]),
      );
      graph.set(name, dependencies);
    }

    return graph;
  }

  /**
   * Diff with another lockfile, returning entries that have been
   * added, changed, and removed compared to the other lockfile.
   *
   * @remarks
   *
   * The other lockfile must also be a {@link PnpmLockfile}, since the diff
   * compares the resolved packages of both lockfiles. An error is thrown for
   * any other lockfile implementation.
   */
  diff(otherLockfile: Lockfile): LockfileDiff {
    if (!(otherLockfile instanceof PnpmLockfile)) {
      throw new Error(
        'A pnpm lockfile can only be diffed with another pnpm lockfile',
      );
    }

    const diff = {
      added: new Array<{ name: string; range: string }>(),
      changed: new Array<{ name: string; range: string }>(),
      removed: new Array<{ name: string; range: string }>(),
    };

    // Keeps track of packages that only exist in this lockfile
    const remainingOldNames = new Set(this.entries.keys());

    for (const [name, otherEntries] of otherLockfile.entries) {
      remainingOldNames.delete(name);

      const thisEntries = this.entries.get(name);
      // A package that only exists in the other lockfile has had all of its
      // entries removed
      if (!thisEntries) {
        diff.removed.push(...otherEntries.map(e => ({ name, range: e.range })));
        continue;
      }

      const remainingOldRanges = new Set(thisEntries.map(e => e.range));

      for (const otherEntry of otherEntries) {
        remainingOldRanges.delete(otherEntry.range);

        const thisEntry = thisEntries.find(e => e.range === otherEntry.range);
        if (!thisEntry) {
          diff.removed.push({ name, range: otherEntry.range });
          continue;
        }

        const thisNode = this.getNode(thisEntry);
        const otherNode = otherLockfile.getNode(otherEntry);
        const thisCheck = thisNode?.integrity ?? thisEntry.version;
        const otherCheck = otherNode?.integrity ?? otherEntry.version;
        if (thisCheck !== otherCheck) {
          diff.changed.push({ name, range: otherEntry.range });
        }
      }

      for (const thisRange of remainingOldRanges) {
        diff.added.push({ name, range: thisRange });
      }
    }

    for (const name of remainingOldNames) {
      const entries = this.entries.get(name) ?? [];
      diff.added.push(...entries.map(e => ({ name, range: e.range })));
    }

    return diff;
  }

  /**
   * Generates a sha1 hex hash of the dependency graph for a package.
   */
  getDependencyTreeHash(startName: string): string {
    if (!this.entries.has(startName)) {
      throw new Error(`Package '${startName}' not found in lockfile`);
    }

    const hash = crypto.createHash('sha1');

    const queue = [startName];
    const seen = new Set<string>();

    while (queue.length > 0) {
      const name = queue.pop()!;

      if (seen.has(name)) {
        continue;
      }
      seen.add(name);

      const entries = this.entries.get(name);
      if (!entries) {
        continue; // In case of missing optional peer dependencies
      }

      hash.update(`pkg:${name}`);
      hash.update('\0');

      const deps = new Array<string>();
      for (const entry of entries) {
        hash.update(entry.version);

        const node = this.getNode(entry);
        if (!node) {
          continue;
        }

        if (node.integrity) {
          hash.update('#');
          hash.update(node.integrity);
        }

        hash.update(' ');

        deps.push(...node.dependencies);
      }

      queue.push(...new Set(deps));
    }

    return hash.digest('hex');
  }

  private getNode(entry: PnpmEntry): PnpmNode | undefined {
    return entry.node ? this.nodes.get(entry.node) : undefined;
  }
}

function parseLockfileData(content: string): PnpmLockfileData {
  let documents;
  try {
    documents = parseAllDocuments(content);
  } catch (err) {
    throw new Error(`Failed pnpm-lock.yaml parse, ${err}`);
  }

  const document = documents[documents.length - 1];
  if (!document) {
    throw new Error('Failed pnpm-lock.yaml parse, the lockfile is empty');
  }
  if (document.errors.length > 0) {
    throw new Error(`Failed pnpm-lock.yaml parse, ${document.errors[0]}`);
  }

  const data = document.toJS() as PnpmLockfileData | null;
  if (!data || typeof data !== 'object') {
    throw new Error('Failed pnpm-lock.yaml parse, the lockfile is empty');
  }

  const version = String(data.lockfileVersion);
  if (!/^9(\.|$)/.test(version)) {
    throw new Error(
      `Unsupported pnpm lockfile version '${data.lockfileVersion}', only version 9 lockfiles are supported`,
    );
  }

  return data;
}

function parsePackageKey(key: string): { name: string; version: string } {
  const [, name, version] = PACKAGE_KEY_PATTERN.exec(key) ?? [];
  if (!name) {
    throw new Error(`Failed to parse pnpm-lock.yaml package '${key}'`);
  }
  return { name, version: stripPeerSuffix(version) };
}

// Strips the peer dependency suffix from `name@version(peer@1.0.0)`
function stripPeerSuffix(key: string): string {
  const index = key.indexOf('(');
  return index === -1 ? key : key.slice(0, index);
}

// Resolves the version and node of an importer dependency, handling links to
// other workspace projects and aliased packages such as `npm:name@^1.0.0`.
function resolveImporterDependency(
  importerDir: string,
  name: string,
  dep: PnpmImporterDependency,
  importers: Record<string, PnpmImporter>,
): { version: string; node?: string } {
  const { version } = dep;

  // Links are written relative to the importer, but are normalized to be
  // relative to the workspace root so that links to the same project from
  // importers at different depths are the same version
  if (version.startsWith('link:')) {
    const linkedDir = resolveLinkedImporter(importerDir, version);
    return {
      version: `link:${linkedDir}`,
      node: linkedDir in importers ? `importer:${linkedDir}` : undefined,
    };
  }

  const resolved = stripPeerSuffix(version);
  const [, aliasedName, aliasedVersion] =
    PACKAGE_KEY_PATTERN.exec(resolved) ?? [];
  if (aliasedName) {
    return {
      version: aliasedVersion,
      node: `${aliasedName}@${aliasedVersion}`,
    };
  }

  return { version: resolved, node: `${name}@${resolved}` };
}

// Resolves the target of a `link:` version to a directory relative to the
// workspace root, using POSIX separators. Absolute links are kept as they are.
function resolveLinkedImporter(importerDir: string, link: string): string {
  const linkPath = link.slice('link:'.length);
  if (posixPath.isAbsolute(linkPath)) {
    return posixPath.normalize(linkPath);
  }
  return posixPath.normalize(posixPath.join(importerDir, linkPath));
}

function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

// Finds the package names of the workspace projects in the lockfile, from the
// link dependencies between them and from their package.json files
async function findImporterNames(
  importers: Record<string, PnpmImporter>,
  options?: PnpmLockfileParseOptions,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();

  for (const [dir, importer] of Object.entries(importers)) {
    for (const field of DEPENDENCY_FIELDS) {
      for (const [name, dep] of Object.entries(importer?.[field] ?? {})) {
        if (dep.version.startsWith('link:')) {
          const linkedDir = resolveLinkedImporter(dir, dep.version);
          if (linkedDir in importers) {
            names.set(linkedDir, name);
          }
        }
      }
    }
  }

  if (options?.workspaceDir) {
    for (const dir of Object.keys(importers)) {
      const name = await readPackageName(
        joinPath(options.workspaceDir, dir, 'package.json'),
      );
      if (name) {
        names.set(dir, name);
      }
    }
  }

  return names;
}

async function readPackageName(path: string): Promise<string | undefined> {
  try {
    const { name } = await fs.readJson(path);
    return typeof name === 'string' ? name : undefined;
  } catch {
    return undefined;
  }
}
