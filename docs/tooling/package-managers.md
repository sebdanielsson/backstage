---
id: package-managers
title: Package Managers
description: Which package managers the Backstage CLI supports, how it detects them, and how a pnpm app differs from a Yarn app.
---

The Backstage CLI runs package manager commands and reads the lockfile of your project. It supports Yarn and pnpm. Yarn is the default, and the rest of the documentation uses Yarn commands. Where a page says `yarn <script>` for a script of your project, a pnpm project runs `pnpm <script>` instead. Commands that are specific to Yarn, such as `yarn workspace` and `yarn install --immutable`, have their own pnpm forms, see [Commands in pnpm projects](#commands-in-pnpm-projects).

:::caution[Experimental]
pnpm support is experimental. The CLI, the app template, and this page may change in ways that require manual updates to your project.
:::

## Supported package managers

- **Yarn** is the default. The app template ships Yarn 4. Every part of the CLI and the app template supports it.
- **pnpm 12.7 or later** is supported on Linux and macOS. The CLI fails with an error that names the minimum version when it finds an older pnpm. The end-to-end tests run on Linux, with both the `hoisted` and the `isolated` node linker. See [Node linkers](#node-linkers) and [Known gaps](#known-gaps).

## Workspace root and installation root

The CLI tells two directories apart:

- The **workspace root** is the closest parent directory whose `package.json` has a `workspaces` field, or that holds a `pnpm-workspace.yaml` file. The lockfile, the package manager settings, and pnpm catalogs live here.
- The **installation root** is the closest parent directory with a `backstage.json` file. This is the Backstage installation that commands such as `versions:bump`, `info`, and `new` work on.

In most projects both are the same directory. In a large monorepo, a Backstage installation can live in a subdirectory of a workspace that holds other projects too. The design assumes one Backstage version per workspace.

## Detection

The CLI looks at the workspace root and picks the package manager in this order:

1. The `packageManager` field in the root `package.json`, when it names `yarn` or `pnpm`.
1. A `pnpm-lock.yaml` file: pnpm.
1. A `yarn.lock` file: Yarn.
1. A `pnpm-workspace.yaml` file: pnpm.
1. A `workspaces` field in the root `package.json`: Yarn.
1. Otherwise Yarn, with a warning.

The `packageManager` field comes first, so that a lockfile left behind by another package manager does not decide which one the CLI uses. This matters while migrating, when the old lockfile is still in the project. A workspace with both a `pnpm-lock.yaml` and a `yarn.lock` file gets a warning about the extra lockfile.

A `packageManager` value other than `yarn` or `pnpm` does not select anything. The CLI warns that the field was ignored and continues with the rest of the list. If there is nothing else to go on, the command fails instead of writing a `yarn.lock` into a project that picked another package manager.

Detection only reads the workspace root. Warnings go to stderr, so the JSON output of commands such as `info --format json` stays parseable.

CLI modules get the same result from the experimental `detectPackageManager` function in `@backstage/cli-node/alpha`. The Yarn package manager module is the exception and works with Yarn only.

## Creating a pnpm app

Pass `--package-manager pnpm` to `@backstage/create-app`:

```shell
npx @backstage/create-app@latest --package-manager pnpm
```

When the command runs through pnpm, pnpm is selected without the option:

```shell
pnpm create @backstage/app
```

The prerequisite check verifies that pnpm 12.7 or later is installed. After the files are written, `create-app` runs `pnpm install` and `pnpm tsc`. Yarn apps get a seed `yarn.lock` with a few known-good dependency pins. pnpm apps do not, and any such pin goes into `overrides` in the template instead.

## What the pnpm template contains

A pnpm app has the same packages and scripts as a Yarn app. These files differ:

- `package.json` sets `packageManager` to pnpm. It has no `workspaces` field and no `resolutions` field. The `build:backend` and `build-image` scripts use `pnpm --filter backend` instead of `yarn workspace backend`.
- `pnpm-workspace.yaml` lists the workspace packages and holds the pnpm settings described below.
- `.yarnrc.yml`, the `.yarn` directory, and `yarn.lock` are not created.
- `packages/backend/Dockerfile` installs pnpm with `npm install -g pnpm@<version>`, where the version matches the `packageManager` field. It copies `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `package.json`, `backstage.json`, and the skeleton archive, and installs with `pnpm install --frozen-lockfile --prod`. The cache mount points at the pnpm store.
- `.github/workflows/ci.yml` sets up pnpm with `pnpm/action-setup` and installs with `pnpm install --frozen-lockfile`.
- `.gitignore` ignores `pnpm-debug.log*` instead of the Yarn files, and `.dockerignore` drops the `.yarn` entries.
- `.prettierignore` ignores `pnpm-lock.yaml`, so that `prettier:check` does not fail on the lockfile.

The template writes plain version ranges for the `@backstage/*` dependencies. You can move them to a catalog yourself, see [Version bumps](#version-bumps).

The `pnpm-workspace.yaml` file looks like this:

```yaml title="pnpm-workspace.yaml"
packages:
  - packages/*
  - plugins/*

nodeLinker: hoisted

minimumReleaseAge: 4320
minimumReleaseAgeExclude:
  - '@backstage/*'

overrides:
  '@yarnpkg/core': 4.9.1
  '@types/react': ^18
  '@types/react-dom': ^18

allowBuilds:
  '@scarf/scarf': false
  '@swc/core': true
  better-sqlite3: true
  # ...
```

What each setting does:

- `nodeLinker: hoisted` gives a flat `node_modules` layout, like the one Yarn produces with `nodeLinker: node-modules`. This is the layout that the plugin ecosystem is tested against. See [Node linkers](#node-linkers).
- `minimumReleaseAge: 4320` tells pnpm to only resolve dependency versions that have been published for at least three days, which limits exposure to compromised releases. `minimumReleaseAgeExclude` lifts the limit for `@backstage/*`, so `versions:bump` can move to a Backstage release on the day it is published. The Yarn template does the same with `npmMinimalAgeGate` and `npmPreapprovedPackages`.
- `overrides` holds the same pins as the `resolutions` field of the Yarn template. pnpm ignores `resolutions`, so the pins live here.
- `allowBuilds` controls which dependencies may run their install scripts. pnpm blocks all of them by default. The template allows the dependencies with native code that a default app needs, and turns off scripts that only print messages or collect telemetry.

### Adding a dependency with build scripts

When you add a dependency that runs a build script on install, `pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS` and lists the packages that are not covered by `allowBuilds`. Add each listed package to `allowBuilds`. Use `true` when the script builds something the package needs, and `false` when it only prints a message. Then run `pnpm install` again:

```yaml title="pnpm-workspace.yaml"
allowBuilds:
  my-native-dependency: true
```

## Version bumps

`versions:bump` resolves the target version of every matching package once, and writes each version where the dependency is already declared:

- A plain range, such as `^1.2.0`, is updated in the `package.json` that declares it.
- A `catalog:` reference is updated in the default catalog of the root `pnpm-workspace.yaml`.
- A `catalog:<name>` reference is left alone, unless you pass `--catalog <name>`.

With `--catalog <name>`, the command updates the entries of that catalog and nothing else. This is useful when you deliberately keep a second release line, such as a `backstage-next` catalog during a migration:

```shell
pnpm backstage-cli versions:bump --catalog backstage-next --release next
```

A catalog that does not exist is an error, so that a typo does not create a catalog that nothing refers to. `versions:bump` never moves a dependency between a range and a catalog, which keeps it compatible with lint rules that enforce catalog usage. It also leaves `backstage.json` alone when it bumps a named catalog.

`--dry-run` shows the bumps without changing any files. `--dry-run --json` prints the resolved versions as JSON on stdout, with all other output on stderr, so that tools such as Renovate or a build system can reuse the version resolution:

```shell
pnpm backstage-cli versions:bump --dry-run --json
```

The `backstage:^` version protocol needs the Backstage Yarn plugin and is not available with pnpm.

## Commands in pnpm projects

The CLI commands work the same in Yarn and pnpm projects. These are the differences:

- `versions:migrate` and `new` run `pnpm install` after they change `package.json` files. `new` runs the `lint --fix` script of the created package with pnpm.
- `repo build`, `repo lint`, and `repo test` with `--since` diff `pnpm-lock.yaml` at the given git ref to find changed packages. The names of the workspace packages are read from the same ref. When the changed lockfile belongs to another package manager, or cannot be compared, all packages count as changed.
- `repo test` finds the packages that `pnpm-workspace.yaml` declares.
- `package build` for backend packages and `build-workspace` copy `pnpm-lock.yaml` and `pnpm-workspace.yaml` into the dist workspace. Packages that need a pack step, for example with `--alwaysPack`, are packed with `pnpm pack`.
- `package bundle` makes the bundle a pnpm project of its own, and prunes and installs its lockfile offline. When the pnpm cache lacks a package, the command fails and names the package and the settings that decide where pnpm looks for it. See [package bundle](./cli/module-build.md#lockfile-and-installation).
- `info` prints a `pnpm:` line with the pnpm version. The JSON output has a `packageManager` object with `name` and `version`. The `yarn` field is only present in Yarn projects.
- `package start --link <path>` accepts a pnpm workspace as the linked workspace. See [Linking in Local Packages](./local-dev/linking-local-packages.md).
- Messages that tell you to run a command, such as `repo fix`, print the pnpm form of the command.

Two tools outside the CLI also follow the package manager:

- The fix of the `no-undeclared-imports` rule in `@backstage/eslint-plugin` uses `pnpm add` and `pnpm remove`. It picks pnpm from the `packageManager` field of the root `package.json`, or from a `pnpm-lock.yaml` file in the workspace root.
- The **Info** tab of the DevTools plugin reads `pnpm-lock.yaml` in pnpm projects. It lists packages installed from the registry. Packages in the workspace itself are not listed in pnpm projects.

## Running under a build system

pnpm workspaces are often driven by a build system that owns installs and caching. The CLI commands are safe to run in that setting:

- No command installs dependencies implicitly. `versions:bump` and `new` run an install only without `--skip-install`, and `package bundle` installs into its own output directory.
- The success caches of `repo test` and `repo lint` are opt-in.
- A readable lockfile is not required. Without one, `--since` counts every package as changed, `versions:bump` skips its report of possibly breaking updates, `info` leaves out installed packages, and `repo test` and `repo lint` run without their success cache.

## Node linkers

The CLI and the backend work with both the `hoisted` and the `isolated` node linker, as long as hoisting is not turned off. The template uses `hoisted`, since plugins with undeclared imports break under `isolated`, and an app must keep working with whatever plugins you install. Many pnpm monorepos run `isolated`, and you can switch to it once your plugins declare all of their imports. The `no-undeclared-imports` lint rule reports the imports that would break.

pnpm 12.7 and later link workspace packages into the root `node_modules` under `hoisted`, as Yarn does. Under `isolated` with the default `hoist: true`, every package is also linked into the hidden `node_modules/.pnpm/node_modules` directory.

## Known gaps

- Layouts where a package can only see its own dependencies are not supported: `hoist: false`, and the global virtual store when the backend is started with plain `node` rather than through `pnpm`. `resolvePackagePath` from `@backstage/backend-plugin-api` cannot find other packages in these layouts, so backend plugins that locate their own files with it, such as their database migrations, fail to start. Keep hoisting enabled for the backend packages, or start the backend through `pnpm` when you use the global virtual store.
- Windows is not supported for pnpm projects.
- The `backstage:^` version protocol needs the Backstage Yarn plugin.
- These `@backstage/repo-tools` commands resolve binaries from the root `node_modules/.bin` or run `yarn`, and do not work in pnpm projects: `package-docs`, the OpenAPI schema commands, `api-reports`, and `type-deps`. `generate-patch` works with Yarn patches only.
- `pm verify-patches` from the Yarn package manager module works with Yarn only. In a pnpm project it reports that no `yarn.lock` was found.
- Only one Backstage version per workspace is supported, apart from a deliberate second release line in a named catalog.
- `create-app` cannot generate an app into an existing pnpm workspace yet.
- Only lockfile version 9 is supported, which pnpm 9 through 12 write.
- Catalogs are not supported in Yarn projects.
- The Backstage repository itself uses Yarn. Contributing to Backstage does not involve pnpm.

## Migrating an existing app from Yarn to pnpm

:::caution[Experimental]
Try the migration on a branch. These steps follow the differences between the Yarn and pnpm app templates, and do not cover changes you have made to your project.
:::

1. Update the app to a Backstage release with pnpm support while it still uses Yarn. If the app uses `backstage:^` versions, remove the Yarn plugin with `yarn plugin remove @yarnpkg/plugin-backstage` and run `yarn backstage-cli versions:bump`, so that every `package.json` has explicit version ranges.
1. Install pnpm 12.7 or later.
1. Create `pnpm-workspace.yaml` in the project root with the settings shown in [What the pnpm template contains](#what-the-pnpm-template-contains). Copy the `packages` globs from the `workspaces` field of the root `package.json`.
1. In the root `package.json`, set `packageManager` to your pnpm version, for example `pnpm@12.14.0`, and remove the `workspaces` field.
1. Move the `resolutions` field of the root `package.json` to `overrides` in `pnpm-workspace.yaml`.
1. Replace `yarn workspace backend` with `pnpm --filter backend` in the root `package.json` scripts, and check any other scripts that call `yarn`.
1. Delete `yarn.lock`, `.yarnrc.yml`, and the `.yarn` directory. Remove the Yarn entries from `.gitignore` and `.dockerignore`, and add `pnpm-debug.log*` to `.gitignore` and `pnpm-lock.yaml` to `.prettierignore`. If the project has Yarn patches in `.yarn/patches`, keep a copy and remove the `patch:` entries from `overrides`. Recreate each patch after the first `pnpm install`: run `pnpm patch <package>`, apply the changes in the directory it prints, and run `pnpm patch-commit <directory>` to write the patch file and the `patchedDependencies` entry.
1. Run `pnpm install`. When a dependency runs a build script that `allowBuilds` does not cover, the install fails with `ERR_PNPM_IGNORED_BUILDS` and lists the packages. Add each of them to `allowBuilds`, then run `pnpm install` again.
1. Update `packages/backend/Dockerfile`: install pnpm with `npm install -g pnpm@<version>`, copy `pnpm-workspace.yaml` and `pnpm-lock.yaml` instead of the Yarn files, and replace `yarn workspaces focus --all --production` with `pnpm install --frozen-lockfile --prod`. Change the cache mount of the install step to the pnpm store, `/home/node/.local/share/pnpm/store`.
1. Update your CI workflow to set up pnpm and run `pnpm install --frozen-lockfile` instead of `yarn install --immutable`. Replace every remaining `yarn` command in the workflow with `pnpm`, and remove the corepack and Yarn cache steps. Add a `pnpm/action-setup` step before `actions/setup-node`, and set `cache: pnpm` on `actions/setup-node`.
1. Run `pnpm tsc`, `pnpm build:all`, and `pnpm test` to verify the project.
