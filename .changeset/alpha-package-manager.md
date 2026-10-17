---
'@backstage/cli-node': patch
---

Added an experimental package manager API in the new `@backstage/cli-node/alpha` entry point. `detectPackageManager()` returns the `PackageManager` of a workspace, which installs dependencies, runs scripts, packs packages, fetches package information, reads the lockfile, and reads and updates pnpm catalogs. Yarn and pnpm are supported, and pnpm requires version 12.7 or later. The package manager is picked from the `packageManager` field of the root `package.json`, then from the lockfile, then from `pnpm-workspace.yaml` or the `workspaces` field. The API may change in any release while it is experimental.
