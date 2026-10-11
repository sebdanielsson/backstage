---
'@backstage/cli-common': patch
---

`targetPaths` now distinguishes two roots. `workspaceRootDir` is the root of the package manager workspace, found through a `workspaces` field in `package.json` or, new in this release, a `pnpm-workspace.yaml` file. `installationRootDir` is the root of the Backstage installation, which is the nearest directory with a `backstage.json` file within the workspace, and otherwise the workspace root. `resolveWorkspaceRoot` and `resolveInstallationRoot` resolve paths relative to each.

`rootDir` and `resolveRoot` are deprecated. They keep returning the workspace root, so switch to whichever of the two roots you need. `overrideTargetPaths` accepts `workspaceRootDir` and `installationRootDir` options.
