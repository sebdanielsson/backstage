---
'@backstage/cli-module-build': patch
---

The `package build`, `build-workspace`, `repo clean`, and `package bundle` commands now pack packages, run scripts, and install dependencies through the detected package manager, and copy the lockfile named by the package manager into dist workspaces. When packing, the correct output flag is now picked based on the Yarn version in use. Messages that suggest running a command now use the detected package manager. The `package bundle` command fails with a clear error for projects whose package manager it does not support. The description of the `--alwaysPack` flag of `build-workspace` no longer mentions Yarn. No functional change for Yarn projects.
