---
'@backstage/cli-module-build': minor
---

**BREAKING**: The frontend bundler now uses the built-in CSS support of Rspack instead of `css-loader` and `style-loader`, which are no longer maintained. Imports of CSS files and CSS modules work as before, including default imports such as `import styles from './styles.module.css'`, with these exceptions:

- Stylesheets of lazy-loaded parts of the app are now added at the end of the document head, after Material UI v4 styles, so they take precedence over them when selectors have the same specificity. Before, they were added in front of Material UI v4 styles. To give Material UI v4 styles precedence again, put your CSS in a cascade layer with `@layer`.
- An `@import` rule after other rules in a CSS file now fails the build. CSS only allows `@import` at the top of a file, so move it there.
- An `@import` or `url()` that starts with `~`, such as `@import '~some-package/styles.css'`, now logs a deprecation warning, which fails builds when the `CI` environment variable is set. Remove the `~`.
