---
'@backstage/cli': patch
---

Added experimental support for pnpm workspaces. Commands detect pnpm from the `packageManager` field of the root `package.json`, from `pnpm-lock.yaml`, or from `pnpm-workspace.yaml`, and then run pnpm and read `pnpm-lock.yaml` where they would run Yarn and read `yarn.lock`. pnpm 12.7 or later is required. Yarn projects are not affected.
