---
'@backstage/backend-dynamic-feature-service': patch
---

The dynamic plugins root directory is now resolved relative to the Backstage installation, which is the nearest directory with a `backstage.json` file, while modules shared with the backend are still resolved from the root of the workspace. Repositories with `backstage.json` at the workspace root behave as before.
