---
'@backstage/cli-node': patch
---

The `pack()` method of `PackageManager` now accepts an optional third argument with process options, such as output callbacks, which are forwarded to the pack command. The working directory is always the directory of the package being packed.
