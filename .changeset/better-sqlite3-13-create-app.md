---
'@backstage/create-app': patch
---

To apply the `better-sqlite3` v13 update to an existing app, update `packages/backend/package.json` and run `yarn install`:

```diff
     "app": "link:../app",
-    "better-sqlite3": "^12.0.0",
+    "better-sqlite3": "^13.0.3",
     "node-gyp": "^10.0.0",
     "pg": "^8.11.3"
```
