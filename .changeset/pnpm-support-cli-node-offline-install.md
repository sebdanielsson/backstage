---
'@backstage/cli-node': patch
---

The install options of the package manager API gained an `offline` flag, which makes the install use only the local cache of the package manager without accessing the network.
