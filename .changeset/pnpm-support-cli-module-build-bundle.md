---
'@backstage/cli-module-build': patch
---

The `package bundle` command now supports pnpm projects. It writes a `pnpm-workspace.yaml` with the merged overrides, seeds and prunes `pnpm-lock.yaml`, and installs the bundle with pnpm.

The settings of the project that change how dependencies resolve are carried into the bundle, and patch files are copied along with the setting that names them, so that a bundle resolves and patches its dependencies the same way the project does. A setting that is not carried and is not known to be irrelevant to the bundle is named in a warning.
