---
'@backstage/cli-node': patch
'@backstage/cli-module-auth': patch
---

`backstage-cli auth` now keeps its tokens in the system credential store through `@napi-rs/keyring` instead of the archived `keytar` package. `@napi-rs/keyring` ships prebuilt binaries, so installs no longer build `keytar` or print its `fs.R_OK` deprecation warning on Node.js 24. Logins stored by earlier versions keep working on macOS and Windows, and tokens that earlier versions kept in files, because `keytar` couldn't be loaded, move to the credential store the first time they're read. On Linux, tokens go to the Secret Service (for example GNOME Keyring or KWallet), or to files when no Secret Service is available. Logins that `keytar` stored in the Secret Service aren't read, so run `backstage-cli auth login` again after upgrading on Linux.
