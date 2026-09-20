---
'@backstage/cli-module-info': patch
---

The `info` command now reports the detected package manager in addition to the existing Yarn version field. In text output the line `yarn: <version>` is now `<package manager>: <version>`, and in JSON output a `packageManager` object with `name` and `version` is added to the `system` section. The existing `yarn` field is kept when the package manager is Yarn. No functional change for Yarn projects.
