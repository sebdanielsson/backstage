---
'@backstage/cli-module-build': patch
---

Added opt-in PostCSS support to the frontend bundler. When a `postcss.config.js`, `postcss.config.cjs`, or `postcss.config.mjs` file is present in the app package root, CSS files are now processed with PostCSS during bundling, which for example makes it possible to use Tailwind CSS in a Backstage app. In addition, imports using the common `@/` alias now resolve to the `src` directory of the app package, matching a `"@/*"` path alias in `tsconfig.json`.
