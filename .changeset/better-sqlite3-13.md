---
'@backstage/backend-test-utils': patch
'@backstage/create-app': patch
---

Updated `better-sqlite3` to v13. It now includes precompiled binaries for Linux (`glibc` 2.34 or later, or `musl`), macOS and Windows on `x64` and `arm64`, so installs no longer download a binary from GitHub, and the same binary works on Node.js 24 and 26. The Linux binaries don't load on distributions with an older `glibc`, such as Debian 11 or Ubuntu 20.04.

Yarn 4.18.1 and earlier still run `node-gyp` for it during install. This needs Python and `make` (Visual Studio Build Tools on Windows) and downloads the Node.js headers from `nodejs.org`, so the install fails where those tools or `nodejs.org` aren't available, such as in the `node:24-trixie-slim` image. To skip this step, upgrade to a Yarn version that supports `gypfile: false`, or add `"dependenciesMeta": { "better-sqlite3": { "built": false } }` to your root `package.json` and run `yarn install`.
