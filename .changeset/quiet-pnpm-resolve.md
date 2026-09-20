---
'@backstage/backend-plugin-api': patch
---

`resolvePackagePath` now also finds packages that are only linked into the running package rather than into the root `node_modules` directory. This is the case for workspace packages, such as the frontend app served by the backend, when the app is installed with pnpm.
