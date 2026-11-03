---
'@backstage/cli-module-build': minor
---

**BREAKING**: Package builds now handle CSS imports with `postcss-modules` directly instead of `rollup-plugin-postcss`, which is no longer maintained. CSS and CSS modules produce the same styles and class names as before.

Package builds no longer compile Sass, Less or Stylus files. Before, `rollup-plugin-postcss` compiled them when `sass`, `less` or `stylus` was installed, while the frontend bundler never supported them. Convert these files to CSS.

PostCSS config files in the directory of a CSS file or above it still apply, but are now found and loaded with `postcss-load-config` 6. It also finds `postcss.config.mjs` and TypeScript config files, and resolves plugins named in a config file relative to that file. A `.postcssrc` file without an extension must now contain JSON, and YAML config files such as `.postcssrc.yaml` need the `yaml` package to be installed.
