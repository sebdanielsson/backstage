---
'@backstage/eslint-plugin': patch
---

The fixer of the `no-undeclared-imports` rule now uses `pnpm add` and `pnpm remove` when a `pnpm-lock.yaml` file exists in the project root, and the reported message suggests the matching `pnpm` command. Projects without a pnpm lockfile keep using Yarn as before. The fixer also passes the dependency type flag correctly when it adds dependencies of inlined packages.
