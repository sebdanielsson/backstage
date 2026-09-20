---
'@backstage/cli-node': minor
---

**BREAKING**: The `Lockfile` class has been renamed to `YarnLockfile`. Import `YarnLockfile` instead of `Lockfile` to parse and load `yarn.lock` files. The name `Lockfile` is now an interface that describes a lockfile independently of the package manager, and `YarnLockfile` implements it.

Added a public package manager API. The new `detectPackageManager()` function detects the package manager of the target project and returns a `PackageManager`. A project that names a supported package manager in the `packageManager` field of its root `package.json` is taken at its word, so that a lockfile left behind by another package manager does not decide which one the commands use. Otherwise the lockfile, the workspace configuration and the `workspaces` field are used, in that order. A project with both a `pnpm-lock.yaml` and a `yarn.lock` file gets a warning. A project that names a package manager which is not supported, and gives no other indication of what it uses, now fails with an error instead of having a Yarn lockfile written into it. The `PackageManager` interface provides `install()`, `run()`, `runScript()`, `runWorkspaceScript()`, `pack()`, `fetchPackageInfo()`, `loadLockfile()`, `parseLockfile()`, `supportsBackstageVersionProtocol()`, and `getCommandHint()`, along with the `Lockfile`, `LockfileEntry`, `LockfileDiff`, `LockfileDiffEntry`, `PackageInfo` and `PackageManagerInstallOptions` types. The `Yarn` class is the implementation for Yarn. When the package manager of a project cannot be determined, detection falls back to Yarn with a warning.

The `hasBackstageYarnPlugin()` function is deprecated in favor of calling `supportsBackstageVersionProtocol()` on the package manager returned by `detectPackageManager()`.

`isMonoRepo()` now also returns `true` for projects that have a `pnpm-workspace.yaml` file in their root.
