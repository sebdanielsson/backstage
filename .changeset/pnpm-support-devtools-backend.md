---
'@backstage/plugin-devtools-backend': patch
---

The Info tab now reads `pnpm-lock.yaml` in projects that use pnpm, and continues to read `yarn.lock` otherwise. In pnpm projects the listing only includes packages installed from a registry; local workspace packages are not listed.
