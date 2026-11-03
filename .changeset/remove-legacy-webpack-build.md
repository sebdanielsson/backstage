---
'@backstage/cli-module-build': minor
---

**BREAKING**: Removed the legacy webpack build. The `LEGACY_WEBPACK_BUILD` environment variable no longer has an effect, and frontend apps and the frontend dev server always use Rspack. The webpack-only dependencies are removed too, including `webpack`, `webpack-dev-server` and `mini-css-extract-plugin`.
