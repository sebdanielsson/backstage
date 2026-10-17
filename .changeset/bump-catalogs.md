---
'@backstage/cli-module-migrate': patch
---

`versions:bump` now writes each new version where the dependency is declared. In pnpm workspaces, `catalog:` references are updated in the default catalog of `pnpm-workspace.yaml` rather than replaced with version ranges, and `--catalog <name>` updates only the entries of that catalog, for example to keep a second release line. Two new flags, `--dry-run` and `--json`, show the bumps without changing any files, and `--dry-run --json` prints the resolved versions for other tools to use.
