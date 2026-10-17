---
'@backstage/cli-module-build': patch
---

`build-workspace` and backend package builds now also copy `pnpm-workspace.yaml` into the dist workspace of pnpm projects, along with `pnpm-lock.yaml`.
