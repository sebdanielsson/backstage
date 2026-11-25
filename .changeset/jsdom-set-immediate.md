---
'@backstage/cli-module-test-jest': patch
---

The Jest 30 `jsdom` test environment now provides `setImmediate` and `clearImmediate`. Some versions of msw 3 use them when mocking requests made with `node:http`, which made those tests fail with `setImmediate is not defined`.
