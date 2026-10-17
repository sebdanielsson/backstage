---
'@backstage/eslint-plugin': patch
---

The fix for `no-undeclared-imports` now uses pnpm to add and remove dependencies in pnpm workspaces, which it recognizes from the `packageManager` field of the root `package.json` or from `pnpm-lock.yaml`. Workspace packages are added with a `workspace:^` range.
