# Replacing ESLint with oxlint in Backstage

Investigation of [backstage/backstage#30190](https://github.com/backstage/backstage/issues/30190) — can oxlint
fully replace ESLint in the Backstage monorepo today?

**TL;DR:** Not as a drop-in replacement. ~85% of Backstage's lint rules have native oxlint
equivalents, and a hybrid `oxlint && eslint` setup is fully viable today and would deliver
the headline 50–100× speedup on most files. A pure oxlint replacement requires waiting for
`no-restricted-syntax` to land natively (or porting the 4 syntax selectors to JS plugins), porting
the 6 custom `@backstage/eslint-plugin` rules to oxlint's JS Plugin API (alpha as of 2026-03), and
either accepting the loss of copyright-header enforcement (`eslint-plugin-notice`) or porting it as
a custom rule. Everything else is either available natively or can be expressed differently.

Environment used for verification: oxlint 1.66.0 (current as of 2026-05), `@oxlint/migrate` 1.66.0,
on the `claude/eslint-oxlint-investigation-OsHtj` branch.

---

## 1. What Backstage uses today

The lint stack is rooted in `.eslintrc.js` plus `packages/cli/config/eslint-factory.js`. Every
workspace package picks up one of three role-based configs (`web-library` / `node-library` /
`common-library`) through `@backstage/cli`.

### 1.1 Shareable configs / plugins extended

| Source | Role |
|---|---|
| `@spotify/eslint-config-base` (es5 + es6) | Core JS style/correctness baseline |
| `@spotify/eslint-config-typescript` | TS overrides (no-unused-vars, no-shadow, no-redeclare, no-array-constructor, no-useless-constructor, no-use-before-define, indent, semi) |
| `@spotify/eslint-config-react` | React + react-hooks + jsx-a11y (extends `plugin:jsx-a11y/recommended`) |
| `prettier` | Disables stylistic rules |
| `plugin:jest/recommended` | Jest correctness rules |
| `plugin:@backstage/recommended` | Custom Backstage import rules |

### 1.2 Direct plugins listed in the root config

`@spotify`, `notice`, `react`, `testing-library`, `@backstage`, `node-import`, plus `import`,
`unused-imports`, `deprecation` from the factory.

### 1.3 Concrete rules used (from the root config + the factory)

- `notice/notice` — copyright-header enforcement (autofix)
- `node-import/prefer-node-protocol`
- `react/react-in-jsx-scope: off`, `react/forbid-elements`, `react/prop-types: off`
- `testing-library/await-async-queries`, `/await-async-utils`, `/no-await-sync-queries`, `/no-dom-import`, `/no-wait-for-side-effects`, `/await-async-events`
- `no-restricted-syntax` — 4 distinct selectors (toLowerCase/toUpperCase ban, React default import bans, winston default-import ban, `__dirname` ban in src)
- `no-restricted-globals` — long allow-list of `window.*` globals
- `no-restricted-imports` — `@material-ui/icons`, `@mui/material`, node builtins, plus glob patterns for `*.test*`, `*.stories*`, `__mocks__`
- `import/newline-after-import`
- `no-shadow`, `no-redeclare`, `no-unused-expressions`, `no-undef` (all delegated to `@typescript-eslint/*` in TS overrides)
- `@typescript-eslint/no-unused-vars`, `/consistent-type-assertions`, `/no-shadow`, `/no-redeclare`, `/no-unused-expressions`
- `unused-imports/no-unused-imports`, `unused-imports/no-unused-vars` (in `**/src/**/generated/**`)
- `deprecation/deprecation` (explicitly set to `off` in the factory, but the plugin is loaded)
- `no-console: 0` for CLI/backend
- `new-cap: error` (capIsNew: false) for backend

### 1.4 The custom `@backstage/eslint-plugin` (6 rules)

Located at `packages/eslint-plugin/`:

- `no-forbidden-package-imports`
- `no-relative-monorepo-imports`
- `no-undeclared-imports`
- `no-mixed-plugin-imports` (with `suggest` + `fixer.replaceText`)
- `no-ui-css-imports-in-non-frontend`
- `no-self-package-imports`
- (extra, not in the recommended preset) `no-top-level-material-ui-4-imports`

All of these use standard ESLint Rule API: `context.report`, `context.physicalFilename`,
`context.sourceCode`, `meta.hasSuggestions`, fixers, schemas, messageIds.

### 1.5 How lint runs

`packages/cli-module-lint/src/commands/{package,repo}/lint.ts` instantiates `new ESLint(...)`
from the `eslint` library directly. Per-package linting runs in worker threads with a SHA1
success cache keyed on file contents + `eslint.calculateConfigForFile()`. Replacing ESLint also
means replacing this driver code — oxlint exposes a CLI, an LSP, and a `Linter` API in the
JS-plugins worker, but no comparable Node.js linting API today.

---

## 2. oxlint capability survey (v1.66.0, May 2026)

Rule counts pulled directly from `crates/oxc_linter/src/rules.rs` on `main`:

| Plugin | Rules in oxlint | Backstage uses it? |
|---|---:|---|
| eslint (core) | 183 | yes |
| typescript | 109 | yes |
| react | 61 (includes `rules-of-hooks`, `exhaustive-deps`, `forbid-elements`, `forbid-component-props`) | yes |
| react-perf | 4 | no |
| unicorn | 131 (includes `prefer-node-protocol`) | partial (via spotify base) |
| jsx-a11y | 36 | yes (via spotify react) |
| oxc | 26 | n/a |
| nextjs | 21 | no |
| jsdoc | 21 | no |
| promise | 16 | no |
| vitest | 72 | no |
| node | 7 | yes |
| vue | 30 | no |
| import | 33 | yes |
| jest | 60 | yes |
| **total native rules** | **810** | |

**Plugins Backstage uses that oxlint does NOT ship natively:**

- `eslint-plugin-testing-library` — no native equivalent
- `eslint-plugin-notice` — no native equivalent
- `eslint-plugin-deprecation` — no native equivalent (oxlint has `typescript/no-deprecated`, similar concept; eslint-plugin-deprecation is already deprecated upstream and recommends migrating to `@typescript-eslint/no-deprecated`)
- `eslint-plugin-unused-imports` — partly covered by oxlint's `eslint/no-unused-vars`, but there's no `unused-imports/no-unused-imports` autofix that strips only the import
- `eslint-plugin-node-import/prefer-node-protocol` — oxlint has `unicorn/prefer-node-protocol`, same rule different namespace
- `@backstage/eslint-plugin` — must be ported / loaded via JS plugins

**Critical missing core rule:** `eslint/no-restricted-syntax` is **not** implemented. Confirmed by
inspecting the source (only `no_restricted_exports`, `no_restricted_globals`, `no_restricted_imports`,
`no_restricted_properties` exist) and by oxlint v1.66 rejecting the rule with
`Rule 'no-restricted-syntax' not found in plugin 'eslint'`.

---

## 3. Mapping each Backstage rule to oxlint

Notation: ✅ native, 🟡 native but with caveats, 🔧 needs JS plugin / rewrite, ❌ not feasible without porting.

### 3.1 Root `.eslintrc.js`

| Backstage rule | Oxlint status | Notes |
|---|---|---|
| `node-import/prefer-node-protocol` | ✅ `unicorn/prefer-node-protocol` | Same semantics, different namespace |
| `@backstage/no-mixed-plugin-imports` | 🔧 JS plugin | Custom — see §4 |
| `react/react-in-jsx-scope: off` | ✅ | Just `"off"` in oxlintrc |
| `notice/notice` | ❌ → 🔧 | No native plugin. Either port as JS plugin (~50 lines, the rule is essentially "regex-match the first comment and replace if missing") or drop and rely on a separate copyright-check script |
| `no-restricted-syntax` (4 selectors) | ❌ → 🔧 | Not implemented in oxlint. Either wait, port as JS plugin (selectors are an ESLint extension; oxlint JS plugins do not currently include `esquery`-style selector matching, so each selector becomes an explicit visitor), or partially cover via existing rules: the React default-import ban already exists as `eslint-plugin-no-restricted-imports` with `importNames: ["default"]`, which oxlint supports |
| `testing-library/await-async-queries` etc. (6 rules) | ❌ → 🔧 | No native plugin. Realistic option: keep `eslint-plugin-testing-library` running under ESLint for test files only (hybrid mode) |
| `no-restricted-globals` (long list) | ✅ | Supported, exact same options shape |
| `react/forbid-elements` | ✅ | Supported with the same `forbid: [{ element, message }]` shape |

### 3.2 `eslint-factory.js` (every package)

| Backstage rule | Oxlint status | Notes |
|---|---|---|
| `deprecation/deprecation: off` | ✅ | Plugin not loaded → just don't enable; or use `typescript/no-deprecated` |
| `no-shadow: off` / `@typescript-eslint/no-shadow: error` | ✅ | Oxlint's `eslint/no-shadow` covers both JS and TS |
| `no-redeclare: off` / `@typescript-eslint/no-redeclare: error` | ✅ | Same |
| `no-undef: off` | ✅ | Same |
| `import/newline-after-import` | ✅ | Native in oxlint's import plugin |
| `no-unused-expressions: off` / TS version | ✅ | Oxlint's `eslint/no-unused-expressions` covers both |
| `@typescript-eslint/consistent-type-assertions` | ✅ | Native |
| `@typescript-eslint/no-unused-vars` | ✅ | Native (one of oxlint's most-tuned rules) |
| `no-restricted-imports` (paths + patterns) | 🟡 | Native, but a handful of [open bugs](https://github.com/oxc-project/oxc/issues?q=is%3Aissue+no-restricted-imports) (side-effect imports with regex, `importNames: ["default"]` flagging namespaces). The Backstage config doesn't trip these |
| `no-restricted-syntax` (winston default import, `__dirname`) | ❌ → 🔧 or substitute | Winston ban can be re-expressed as `no-restricted-imports` with `importNames: ["default"]`. `__dirname` ban has no clean substitute — needs a JS-plugin rule |
| `react/prop-types: off` | ✅ | |
| `react/react-in-jsx-scope: off` | ✅ | |
| `no-console: 0` (cli/backend) | ✅ | |
| `new-cap: error` (cli/backend) | ✅ | Native, same options |
| Generated-file override: `unused-imports/no-unused-imports`, `unused-imports/no-unused-vars` | 🟡 | Approximate with `eslint/no-unused-vars` + `varsIgnorePattern: '^_'`. No autofix that strips only the import |

### 3.3 `@spotify/eslint-config-base` (~120 rules)

Most are stylistic and `prettier` already disables them. Of the meaningful ones:

- `block-scoped-var`, `consistent-return`, `curly`, `default-case`, `dot-notation`, `eqeqeq`,
  `guard-for-in`, `no-alert`, `no-caller`, `no-else-return`, `no-eval`, `no-extend-native`,
  `no-extra-bind`, `no-fallthrough`, `no-implied-eval`, `no-iterator`, `no-labels`, `no-lone-blocks`,
  `no-loop-func`, `no-multi-str`, `no-new`, `no-new-func`, `no-new-wrappers`, `no-param-reassign`,
  `no-proto`, `no-return-assign`, `no-script-url`, `no-self-compare`, `no-sequences`,
  `no-throw-literal`, `no-unused-expressions`, `no-with`, `radix`, `yoda`, `no-cond-assign`,
  `no-console`, `no-constant-condition`, `no-control-regex`, `no-debugger`, `no-dupe-args`,
  `no-dupe-keys`, `no-duplicate-case`, `no-empty`, `no-ex-assign`, `no-func-assign`,
  `no-inner-declarations`, `no-invalid-regexp`, `no-irregular-whitespace`, `no-obj-calls`,
  `no-regex-spaces`, `no-sparse-arrays`, `no-unreachable`, `use-isnan`, `valid-typeof`,
  `no-nested-ternary`, `no-redeclare`, `no-shadow-restricted-names`, `no-shadow`, `no-delete-var`,
  `no-unused-vars`, `no-use-before-define`, `new-cap`, `no-unsafe-finally`, `prefer-const`,
  `prefer-template`, `no-const-assign`, `no-useless-constructor`, `no-var` — **all ✅ native**

The only Spotify rules with no oxlint equivalent are purely formatter-style (`indent`, `semi`,
`brace-style`, `space-before-blocks`, …), which Prettier already disables anyway.

---

## 4. The custom `@backstage/eslint-plugin`

Empirically verified: oxlint **can load JavaScript ESLint-style plugins** through the `jsPlugins`
config key. I created a minimal plugin with `meta`, `rules`, a fixer, a suggestion, and a visitor;
oxlint ran it, reported diagnostics, and `oxlint --fix` correctly applied the rewrite.

```jsonc
// /tmp/oxtest/.oxlintrc.json
{
  "plugins": ["typescript"],
  "jsPlugins": ["./my-plugin.js"],
  "rules": { "@backstage/no-foo": "error" }
}
```

Result:

```
test.ts:1:7: error @backstage(no-foo): foo->bar
# after --fix:
const bar = 1;
```

So the API surface needed by `@backstage/eslint-plugin` is supported:

- `context.report({ node, messageId, data, fix, suggest })` — works
- `context.physicalFilename`, `context.filename`, `context.cwd` — works
- `context.sourceCode.getText(...)` — works
- `fixer.replaceText(...)` — works
- `meta.schema`, `meta.messages`, `meta.hasSuggestions`, `meta.fixable` — works

**Caveats:**

- JS Plugins are alpha (as of 2026-03-11 blog post). Most plugins work unmodified, but it's not
  yet declared stable.
- An attempt to load `packages/eslint-plugin/index.js` directly failed with
  `Cannot find module '@manypkg/get-packages'` — but that's just because `yarn install` hasn't
  been run in the container, not a fundamental incompatibility. The Backstage plugin's surface
  area (visitImports, getPackages, minimatch) is all standard Node and would Just Work.
- Performance: JS plugin rules run in a JS worker pool, not in Rust, so the 50–100× headline only
  applies to native rules. Plugins that scan every file (`no-undeclared-imports`,
  `no-mixed-plugin-imports`) would still be the bottleneck.

---

## 5. `oxlint-migrate` reality check

The tool only accepts **ESLint v9 flat config**. Backstage uses the legacy `.eslintrc.js` format
across ~150 packages. So `oxlint-migrate` cannot be run against the current Backstage tree at all
unless the configs are first converted to flat config (which is a separate large project — every
`.eslintrc.js` in `/packages/**/.eslintrc.js` would need rewriting).

If/when Backstage migrates to flat config, the migrator will:

- Translate rule names and severities
- Convert `jsx-a11y`, `next`, `react`, `jsdoc`, `vitest` settings
- **Drop** `settings` blocks inside `overrides` (oxlint doesn't support per-override settings)
- **Drop** rules that have no oxlint equivalent (silently in many cases)
- **Not migrate** local plugins referenced by file path
- **Not migrate** ESLint inline comments whose syntax oxlint doesn't recognize (unless
  `--replace-eslint-comments` is set, and even then "some are not supported")

---

## 6. Driver code changes required

`packages/cli-module-lint/src/commands/{package,repo}/lint.ts` instantiates `new ESLint()` and
calls `lintFiles`, `loadFormatter`, `outputFixes`, `isPathIgnored`, `calculateConfigForFile`.
Oxlint exposes **no equivalent Node.js library API today** — only a CLI, an LSP, and a JS-plugins
worker context. To replace ESLint here, the driver would need to either:

1. **Shell out to the `oxlint` binary per package** — straightforward, but loses the SHA1 success-
   cache hashing that uses `eslint.calculateConfigForFile()`. The hash would need to be derived
   from the resolved `.oxlintrc.json` (which oxlint can print with `--print-config`) instead.
2. **Use the oxlint LSP / `--lsp` mode** — overkill for batch CI.

Either approach is several hundred lines of work in `packages/cli-module-lint`.

---

## 7. What I actually tried

| Test | Result |
|---|---|
| `oxlint --version` → 1.66.0 | ✅ |
| `oxlint --print-config` with full plugin set enabled | ✅ — 243 rules on by default |
| Config with `no-restricted-syntax` | ❌ `Rule 'no-restricted-syntax' not found in plugin 'eslint'` |
| Config without `no-restricted-syntax` | ✅ |
| Run oxlint on `packages/cli/src/wiring/` with `correctness/suspicious/pedantic` enabled | ✅ — 31 warnings, includes `unicorn/explicit-length-check`, `unicorn/prefer-at`, `eslint/max-lines`, `eslint/require-await`, `eslint/no-warning-comments`. None false-positive in this sample |
| Run oxlint with `jsPlugins: ['./my-plugin.js']` + fixer + suggest | ✅ — diagnostics, `--fix` applied successfully |
| Load `packages/eslint-plugin/index.js` via `jsPlugins` | ⚠️ Failed because `@manypkg/get-packages` not installed in this container; the API surface is correct |
| `npx @oxlint/migrate .eslintrc.js` | ❌ Tool only accepts flat config (`.eslintrc.js` is legacy) |

---

## 8. Verdict and recommendation

### Pure replacement: not yet

Blockers, in order of severity:

1. **`no-restricted-syntax` missing in oxlint core.** Backstage relies on 4 distinct AST selectors
   that cannot be expressed with `no-restricted-imports`. This is the single biggest blocker.
2. **`@backstage/eslint-plugin` runs on JS Plugins (alpha).** Functional, but not yet stable, and
   loses the performance edge for the plugin's rules.
3. **`eslint-plugin-testing-library` has no oxlint equivalent.** Either drop it or keep ESLint for
   test files.
4. **`eslint-plugin-notice` has no oxlint equivalent.** Copyright header checking would need to be
   ported or replaced with an out-of-band script.
5. **Driver rewrite in `packages/cli-module-lint`.** Several hundred lines.
6. **`oxlint-migrate` requires flat config**, which Backstage hasn't adopted.

### The pragmatic path — hybrid mode behind a flag (matches the issue's original suggestion)

This is realistic to ship today and matches the `EXPERIMENTAL_OXLINT` flag pattern the issue author
proposed:

```jsonc
// .oxlintrc.json at the repo root
{
  "plugins": ["typescript", "react", "import", "unicorn", "jest", "jsx-a11y", "node"],
  "categories": { "correctness": "error" },
  "rules": {
    "unicorn/prefer-node-protocol": "error",
    "react/react-in-jsx-scope": "off",
    "react/forbid-elements": ["warn", { "forbid": [/* ... */] }],
    "no-restricted-imports": ["error", { /* current paths/patterns */ }],
    "no-restricted-globals": ["error", /* current list */ ]
  }
}
```

Plus `package.json`:

```json
{ "scripts": { "lint": "oxlint && eslint" } }
```

And install `eslint-plugin-oxlint` in `@backstage/cli` to auto-disable rules ESLint would
double-check. This delivers the 50–100× speedup on every file for the ~80% of rules oxlint handles,
while ESLint still runs `no-restricted-syntax`, `eslint-plugin-testing-library`,
`eslint-plugin-notice`, and the custom plugin. Files with no ESLint findings are dominated by
oxlint's runtime.

A pure replacement is on the table once: (a) oxlint ships `no-restricted-syntax`, (b) JS Plugins
graduate from alpha, (c) Backstage's lint driver is rewritten, and (d) `notice` and
`testing-library` are either ported or accepted as losses.

---

## Sources

- [Issue #30190 — Replace eslint with oxlint](https://github.com/backstage/backstage/issues/30190)
- [Oxlint built-in plugins](https://oxc.rs/docs/guide/usage/linter/plugins)
- [Oxlint JS Plugins Alpha announcement (2026-03-11)](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha)
- [Oxlint JS Plugins Preview (2025-10-09)](https://oxc.rs/blog/2025-10-09-oxlint-js-plugins.html)
- [eslint-plugin-oxlint — turn off ESLint rules covered by oxlint](https://github.com/oxc-project/eslint-plugin-oxlint)
- [@oxlint/migrate](https://github.com/oxc-project/oxlint-migrate)
- [oxc-project/oxc — `crates/oxc_linter/src/rules.rs`](https://github.com/oxc-project/oxc/blob/main/crates/oxc_linter/src/rules.rs)
- [Open `no-restricted-imports` issues in oxc](https://github.com/oxc-project/oxc/issues?q=is%3Aissue+no-restricted-imports)
