---
'@backstage/cli-node': patch
---

Running TypeScript code with the Backstage CLI on Node.js 26 no longer prints a `module.register()` deprecation warning (DEP0205). On Node.js 26 and later, the module hooks are now registered with `module.registerHooks()`. Older Node.js versions keep using `module.register()`.

JSON files that are imported without an import attribute are now parsed as strict JSON, the same as when they are loaded with `require()`. Comments and trailing commas in these files are no longer accepted.
