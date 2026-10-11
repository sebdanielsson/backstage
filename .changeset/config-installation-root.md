---
'@backstage/config-loader': patch
---

When no root directory is given, the default configuration sources now look for configuration files in the Backstage installation, which is the nearest directory with a `backstage.json` file, rather than at the root of the workspace. Repositories with `backstage.json` at the workspace root behave as before.
