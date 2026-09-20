---
'@backstage/cli-module-test-jest': patch
---

The `repo test` command now reads the lockfile through the detected package manager when the success cache is enabled. No functional change for Yarn projects.
