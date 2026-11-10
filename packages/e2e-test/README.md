# e2e-test

End-to-end test for verifying Backstage packages.

## Usage

This package is only meant for usage within the Backstage monorepo.

All packages need to be installed and built before running the test. In a fresh clone of this repo you first need to run the following from the repo root:

```sh
yarn install
yarn tsc
yarn build:all
```

Once those tasks have completed, you can now run the test using `yarn e2e-test run`. The created app uses Yarn by default. Pass `--package-manager pnpm` to test an app that uses pnpm instead. This requires pnpm 11.28 or a later 11.x release, or pnpm 12.7 or later, to be installed. A pnpm app uses the `hoisted` node linker of the template, and `--node-linker isolated` switches it to the `isolated` linker. The app is pinned to the pnpm version that runs the test, unless `--keep-pnpm-version` keeps the version that the template pins.

If you make changes to other packages you will need to rerun `yarn tsc && yarn build`. Changes to this package do not require a rebuild.

## Docker smoke test

On Linux with Docker and Buildx, `yarn e2e-test run-docker` packs the packages in this checkout with `--always-pack`, serves them from a disposable local registry, generates the default pnpm application, and builds its unchanged production Dockerfile. The run stops after the build, so it does not perform runtime checks yet.

The command needs the normal repository build first (`yarn install && yarn tsc && yarn backstage-cli repo build`) and pnpm 12.14.0. Pass `--keep` to retain the generated application, and `--artifacts-directory <path>` to collect logs, the package inventory, the image ID, and phase timings. It does not run on macOS or Windows.

## Documentation

- [Backstage Readme](https://github.com/backstage/backstage/blob/master/README.md)
- [Backstage Documentation](https://backstage.io/docs)
