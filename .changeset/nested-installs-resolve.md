---
'@backstage/cli': patch
'@backstage/cli-module-build': patch
'@backstage/cli-module-config': patch
'@backstage/cli-module-github': patch
'@backstage/cli-module-info': patch
'@backstage/cli-module-lint': patch
'@backstage/cli-module-maintenance': patch
'@backstage/cli-module-migrate': patch
'@backstage/cli-module-new': patch
'@backstage/cli-module-test-jest': patch
'@backstage/cli-module-translations': patch
---

Commands now tell the package manager workspace apart from the Backstage installation inside it. Files that belong to the installation, such as `backstage.json`, `app-config.yaml`, `tsconfig.json`, and the root `package.json` that declares CLI modules and templates, are read relative to the nearest directory with a `backstage.json` file, `backstage-cli new` creates packages there, and `versions:bump` only bumps the packages inside it. The lockfile and package manager settings are still read from the workspace root. This lets a Backstage installation live in a subdirectory of a larger workspace. Repositories with `backstage.json` at the workspace root behave as before.
