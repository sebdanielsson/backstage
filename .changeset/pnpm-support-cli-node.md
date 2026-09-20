---
'@backstage/cli-node': patch
---

Added support for pnpm to the package manager API. Projects with a `pnpm-lock.yaml` file, a `packageManager` field naming pnpm, or a `pnpm-workspace.yaml` file are now detected as pnpm projects, and `detectPackageManager()` returns the new `Pnpm` implementation for them instead of falling back to Yarn. pnpm 12.4 or later is required, and older versions fail with an error that names the minimum version.

The new `PnpmLockfile` class parses `pnpm-lock.yaml` files, including lockfiles written as multiple YAML documents when pnpm is pinned through the `packageManager` field.
