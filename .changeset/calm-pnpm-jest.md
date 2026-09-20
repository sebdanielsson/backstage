---
'@backstage/cli-module-test-jest': patch
---

`backstage-cli repo test` now finds the packages of pnpm workspaces, which declare them in `pnpm-workspace.yaml` rather than in the `workspaces` field of the root `package.json`.
