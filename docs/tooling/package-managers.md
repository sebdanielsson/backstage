---
id: package-managers
title: Package Managers
description: Which package managers the Backstage CLI supports, how it detects them, and how a pnpm app differs from a Yarn app.
---

The Backstage CLI runs package manager commands and reads the lockfile of your
project. It supports Yarn and pnpm. Yarn is the default, and the rest of the
documentation uses Yarn commands. Where a page says `yarn <script>` for a
script of your project, a pnpm project runs `pnpm <script>` instead. Commands
that are specific to Yarn, such as `yarn workspace`, `yarn install`, and the
patch commands, have their own pnpm forms. See
[Commands in pnpm projects](#commands-in-pnpm-projects) and
[Migrating an existing app from Yarn to pnpm](#migrating-an-existing-app-from-yarn-to-pnpm).

:::caution[Experimental]
pnpm support is experimental. The CLI, the app template, and this page may
change in ways that require manual updates to your project.
:::

## Supported package managers

- **Yarn** is the default. The app template ships Yarn 4. Every part of the
  CLI and the app template supports it.
- **pnpm 12.4 or later** is supported on Linux and macOS. The end-to-end
  tests run on Linux. The CLI fails with an error that names the minimum
  version when it finds an older pnpm. Apps use the `hoisted` node linker. See
  [Limitations](#limitations).

## Detection

The CLI looks at the project root and picks the package manager in this order:

1. The `packageManager` field in the root `package.json`, when it names `yarn`
   or `pnpm`.
1. A `pnpm-lock.yaml` file: pnpm.
1. A `yarn.lock` file: Yarn.
1. A `pnpm-workspace.yaml` file: pnpm.
1. A `workspaces` field in the root `package.json`: Yarn.
1. Otherwise Yarn, with a warning.

The `packageManager` field comes first, so that a lockfile left behind by
another package manager does not decide which one the CLI uses. This matters
while migrating, when the old lockfile is still in the project.

A value other than `yarn` or `pnpm` does not select anything. The CLI prints a
warning that the field was ignored and continues with the rest of the list. If
there is nothing else to go on, the command fails instead of writing a
`yarn.lock` into a project that picked another package manager.

The result is cached per project root. Warnings go to stderr, so the JSON
output of commands such as `info --format json` stays parseable.

The project root is the closest parent directory that has a `workspaces` field
in its `package.json` or a `pnpm-workspace.yaml` file. Keep only one lockfile
in the project. A project with both a `pnpm-lock.yaml` and a `yarn.lock` gets a
warning and is treated as a pnpm project.

CLI modules that run package manager commands get the same result from the
`detectPackageManager` function in `@backstage/cli-node`. The Yarn package
manager module does not use it and works with Yarn only, see
[Limitations](#limitations). See
[Custom CLI Modules](./cli/building-cli-modules.md) for using the function in
your own module.

## Creating a pnpm app

Pass `--package-manager pnpm` to `@backstage/create-app`:

```shell
npx @backstage/create-app@latest --package-manager pnpm
```

When the command runs through pnpm, pnpm is selected without the option:

```shell
pnpm create @backstage/app
```

The prerequisite check verifies that pnpm 12.4 or later is installed. After
the files are written, `create-app` runs `pnpm install` and `pnpm tsc`. Yarn
apps get a seed `yarn.lock` with a few known-good dependency pins. pnpm apps
do not. When a pnpm app needs such a pin, it is added to `overrides` in the
template.

## What the pnpm template contains

A pnpm app has the same packages and scripts as a Yarn app. These files
differ:

- `package.json` sets `packageManager` to pnpm. It has no `workspaces` field
  and no `resolutions` field. The `build:backend` and `build-image` scripts
  use `pnpm --filter backend` instead of `yarn workspace backend`.
- `pnpm-workspace.yaml` lists the workspace packages and holds the pnpm
  settings described below.
- `.yarnrc.yml`, the `.yarn` directory, and `yarn.lock` are not created.
- `packages/backend/Dockerfile` installs pnpm with
  `npm install -g pnpm@<version>`, where the version matches the
  `packageManager` field in `package.json`. It copies `pnpm-workspace.yaml`,
  `pnpm-lock.yaml`, `package.json`, `backstage.json`, and the skeleton archive,
  and installs with `pnpm install --frozen-lockfile --prod`. The cache mount
  points at the pnpm store instead of the Yarn cache.
- `.github/workflows/ci.yml` sets up pnpm with `pnpm/action-setup` and
  installs with `pnpm install --frozen-lockfile`.
- `.gitignore` ignores `pnpm-debug.log*` instead of the Yarn files, and
  `.dockerignore` drops the `.yarn` entries.
- `.prettierignore` ignores `pnpm-lock.yaml`, so that `prettier:check` does
  not fail on the lockfile.

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
  '@types/react': ^18
  '@types/react-dom': ^18

allowBuilds:
  '@scarf/scarf': false
  '@swc/core': true
  better-sqlite3: true
  # ...
```

What each setting does:

- `nodeLinker: hoisted` gives a flat `node_modules` layout. This is the layout
  that Yarn produces with `nodeLinker: node-modules`, and the layout that
  Backstage and its plugins are tested against. The `isolated` linker exposes
  undeclared imports in plugins and is not supported.
- `minimumReleaseAge: 4320` tells pnpm to only resolve dependency versions
  that have been published for at least three days. This limits exposure to
  compromised releases. `minimumReleaseAgeExclude` lifts the limit for
  `@backstage/*`, so `versions:bump` can move to a Backstage release on the
  day it is published. The Yarn template does the same with
  `npmMinimalAgeGate` and `npmPreapprovedPackages`.
- `overrides` pins the React type packages to one major version across the
  workspace. This matches the `resolutions` field of the Yarn template. pnpm
  ignores `resolutions`, so the pins live here.
- `allowBuilds` controls which dependencies may run their install scripts.
  pnpm blocks all of them by default. The template allows the dependencies
  with native code that a default app needs, and turns off scripts that only
  print messages or collect telemetry. The list also covers `msw`, which the
  frontend plugin template adds.

### Workspace packages in node_modules {#workspace-packages-in-node-modules}

pnpm links a workspace package only into the `node_modules` directories of the
packages that depend on it, not into the root `node_modules`. Yarn links every
workspace package into the root. This matters for code in a hoisted dependency
that resolves a workspace package by name. The `resolvePackagePath` function
from `@backstage/backend-plugin-api` handles this by also resolving from the
working directory and from the running backend package. This is how the
backend finds the `app` package that it serves. Plain `require.resolve` calls
from a dependency do not have this fallback.

### Adding a dependency with build scripts

When you add a dependency that runs a build script on install, `pnpm install`
fails with `ERR_PNPM_IGNORED_BUILDS` and lists the packages that are not
covered by `allowBuilds`. Add each listed package to `allowBuilds`. Use `true`
when the script builds something the package needs, and `false` when it only
prints a message. Then run `pnpm install` again:

```yaml title="pnpm-workspace.yaml"
allowBuilds:
  my-native-dependency: true
```

## Commands in pnpm projects

The CLI commands work the same in Yarn and pnpm projects. These are the
differences:

- `versions:bump` writes explicit version ranges such as `^1.2.0` to every
  `package.json`. There is no pnpm equivalent of the `backstage:^` version
  protocol, so the command skips the step that updates the Backstage Yarn
  plugin. After the bump it runs `pnpm install`, unless `--skip-install` is
  set. See [Keeping Backstage Updated](../getting-started/keeping-backstage-updated.md).
- `versions:migrate` and `new` run `pnpm install` after they change
  `package.json` files. `new` runs `pnpm run lint --fix` on the created
  package.
- `repo build`, `repo lint`, and `repo test` with `--since` diff
  `pnpm-lock.yaml` at the given git ref to find changed packages. When the
  changed lockfile belongs to another package manager, all packages count as
  changed.
- `package build` for backend packages and `build-workspace` copy
  `pnpm-lock.yaml` and `pnpm-workspace.yaml` into the dist workspace. Most
  packages are copied into the workspace without a pack step. Packages that
  need one, for example when `--alwaysPack` is set, are packed with
  `pnpm pack` where the Yarn flow uses `yarn pack`.
- `package bundle` writes a `pnpm-workspace.yaml` in the bundle with
  `nodeLinker: hoisted` and the `overrides` of the project. It also copies the
  `storeDir`, `cacheDir`, `minimumReleaseAge`, `minimumReleaseAgeExclude`,
  `resolutionMode`, and `allowBuilds` settings of the project. It seeds
  `pnpm-lock.yaml` from the plugin directory or the monorepo root, prunes it
  with an offline install, and, for backend plugins, installs the private
  `node_modules` offline. When the pnpm cache lacks something, the command
  warns and retries that step with `--prefer-offline`. See
  [package bundle](./cli/module-build.md#package-bundle).
- `info` prints a `pnpm:` line with the pnpm version. The JSON output has a
  `packageManager` object with `name` and `version`. The `yarn` field is only
  present in Yarn projects.
- `package start --link <path>` accepts a pnpm workspace as the linked
  workspace. See [Linking in Local Packages](./local-dev/linking-local-packages.md).
- Messages that tell you to run a command, such as `repo fix`, print
  `pnpm <command>`.

Two tools outside the CLI also follow the package manager:

- The `no-undeclared-imports` rule in `@backstage/eslint-plugin` adds and
  removes dependencies in its fixer. It uses `pnpm add` and `pnpm remove` when
  the project root has a `pnpm-lock.yaml`, and Yarn otherwise.
- The **Info** tab of the DevTools plugin reads `pnpm-lock.yaml` when it
  exists. It lists packages installed from the registry. Packages in the
  workspace itself are not listed in pnpm projects.

## Limitations

- The `isolated` node linker is not supported. Use `nodeLinker: hoisted`.
- Windows is not supported for pnpm projects.
- The `backstage:^` version protocol needs the Backstage Yarn plugin. pnpm
  projects use explicit version ranges.
- `pm verify-patches` and `@backstage/repo-tools` are not supported in pnpm
  projects. `generate-patch` works with Yarn patches and `yarn.lock` only,
  and other `repo-tools` commands, such as `package-docs` and the OpenAPI
  schema commands, read `yarn.lock` or run `yarn`. In a pnpm project,
  `pm verify-patches` reports that no `yarn.lock` was found.
- The Backstage repository itself uses Yarn. Contributing to Backstage does
  not involve pnpm.
- Only lockfile version 9 is supported. This is the version that pnpm 9
  through 12 write. A later pnpm release with a new lockfile version is not
  supported until the parser is updated.

## Migrating an existing app from Yarn to pnpm

:::caution[Experimental]
Try the migration on a branch. The steps below derive from the differences
between the Yarn and pnpm app templates and do not cover changes you have made
to your project.
:::

1. Update the app to a Backstage release with pnpm support while it still
   uses Yarn. The backend depends on this to find the `app` package, see
   [Workspace packages in node_modules](#workspace-packages-in-node-modules).
   If the app uses `backstage:^` versions, remove the Yarn plugin with
   `yarn plugin remove @yarnpkg/plugin-backstage` and run
   `yarn backstage-cli versions:bump`, so that every `package.json` has
   explicit version ranges.
1. Install pnpm 12.4 or later.
1. Create `pnpm-workspace.yaml` in the project root with the settings shown in
   [What the pnpm template contains](#what-the-pnpm-template-contains). Copy
   the `packages` globs from the `workspaces` field of the root
   `package.json`.
1. In the root `package.json`, set `packageManager` to your pnpm version, for
   example `pnpm@12.4.2`, and remove the `workspaces` field.
1. Move the `resolutions` field of the root `package.json` to `overrides` in
   `pnpm-workspace.yaml`. pnpm reads overrides from the workspace file only,
   not from a `pnpm.overrides` field in `package.json`.
1. Replace `yarn workspace backend` with `pnpm --filter backend` in the root
   `package.json` scripts, and check any other scripts that call `yarn`.
1. Delete `yarn.lock`, `.yarnrc.yml`, and the `.yarn` directory. Remove the
   Yarn entries from `.gitignore` and `.dockerignore`, and add
   `pnpm-debug.log*` to `.gitignore` and `pnpm-lock.yaml` to
   `.prettierignore`. If the project has Yarn patches in `.yarn/patches`,
   keep a copy and remove the `patch:` entries from `overrides`. Recreate
   each patch after the first `pnpm install`: run `pnpm patch <package>`,
   apply the changes in the directory it prints, and run
   `pnpm patch-commit <directory>` to write the patch file and the
   `patchedDependencies` entry. The Backstage patch tooling does not work
   with pnpm, see [Limitations](#limitations).
1. Run `pnpm install`. When a dependency runs a build script that
   `allowBuilds` does not cover, the install fails with
   `ERR_PNPM_IGNORED_BUILDS` and lists the packages under "Ignored build
   scripts". Add each listed package to `allowBuilds`, then run
   `pnpm install` again.
1. Update `packages/backend/Dockerfile`: install pnpm with
   `npm install -g pnpm@<version>`, copy `pnpm-workspace.yaml` and
   `pnpm-lock.yaml` instead of the Yarn files, and replace
   `yarn workspaces focus --all --production` with
   `pnpm install --frozen-lockfile --prod`. Change the cache mount of the
   install step to the pnpm store, `/home/node/.local/share/pnpm/store`.
1. Update your CI workflow to set up pnpm and run
   `pnpm install --frozen-lockfile` instead of `yarn install --immutable`.
   Replace every remaining `yarn` command in the workflow with `pnpm`. Remove
   the corepack step and the Yarn cache steps. Add a `pnpm/action-setup` step
   before `actions/setup-node` and set `cache: pnpm` on `actions/setup-node`.
1. Run `pnpm tsc`, `pnpm build:all`, and `pnpm test` to verify the project.
