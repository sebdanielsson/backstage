---
'@backstage/cli-module-build': minor
---

**BREAKING**: The frontend bundler now applies PostCSS config files to CSS, like package builds already do. For each CSS file outside `node_modules`, the first config file in the directory of the file or above it is used. CSS files without a config file are left unchanged.

If your repository already has a PostCSS config file, for example at its root or as a `postcss` field in a `package.json` file, it now also applies to the CSS of your app and of the workspace packages that it includes, and the build fails if the plugins that it names can't be loaded. If the config file isn't meant for these CSS files, move it to the directory of the files that it's meant for.
