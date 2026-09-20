---
'@backstage/cli-common': patch
---

Project root detection now also recognizes a directory that contains a `pnpm-workspace.yaml` file as the project root, in addition to a `package.json` with a `workspaces` field.
