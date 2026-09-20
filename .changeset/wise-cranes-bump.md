---
'@backstage/cli-module-migrate': patch
---

The `versions:bump` and `versions:migrate` commands now install dependencies and read the lockfile through the detected package manager. The `versions:bump` command only updates the Backstage Yarn plugin when the package manager supports the `backstage:^` version protocol, which is the same condition as before. The description of the `--skip-install` flag no longer mentions Yarn. No functional change for Yarn projects.
