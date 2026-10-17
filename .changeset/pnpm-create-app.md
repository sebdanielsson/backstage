---
'@backstage/create-app': patch
---

Added a `--package-manager <yarn|pnpm>` option. With `pnpm`, the created app is a pnpm workspace with a `pnpm-workspace.yaml` in place of the Yarn configuration, and its scripts, Dockerfile, CI workflow, and documentation use pnpm. pnpm is also picked when the command runs through pnpm, as with `pnpm create @backstage/app`, and requires pnpm 12.7 or later. Apps still use Yarn by default.
