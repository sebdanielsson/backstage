---
'@backstage/plugin-devtools-backend': patch
---

The Info tab now reads the package versions from `pnpm-lock.yaml` in pnpm projects. The `backstage.json` version is read from the Backstage installation, which is the nearest directory with a `backstage.json` file, rather than from the root of the workspace.
