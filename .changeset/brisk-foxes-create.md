---
'@backstage/cli-module-new': patch
---

The `new` command now installs dependencies, runs lint fixes, and reads the lockfile through the detected package manager. The description of the `--skip-install` flag no longer mentions Yarn. No functional change for Yarn projects.
