# 🔬 Autopsia

[![CI](https://github.com/SanBenito12/Autopsia/actions/workflows/ci.yml/badge.svg)](https://github.com/SanBenito12/Autopsia/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/autopsia-rn)](https://www.npmjs.com/package/autopsia-rn)
[![MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

English · [Español](README.es.md)

**Stop new architecture violations in your React Native app—without fixing all your legacy debt first.**

Autopsia checks your TypeScript dependencies against configured layer rules. Record today's debt as a baseline, block new errors in CI, and explore an offline dependency graph.

[Try the interactive demo](https://sanbenito12.github.io/Autopsia/report.html) · [Get started](https://github.com/SanBenito12/Autopsia/blob/main/docs/getting-started.md) · [Website](https://sanbenito12.github.io/Autopsia/)

![Actual CLI output from the public sample fixture](https://raw.githubusercontent.com/SanBenito12/Autopsia/main/docs/demo.png)

## Get a useful report

Requires Node 18+. Run from your project root:

```bash
npx autopsia-rn@0.5.0 init
npx autopsia-rn@0.5.0 scan . --html --open
```

Review the generated configuration and coverage first. `init` detects common layer names under `src/` and `src/features/*/`; other structures need manual patterns. If files are unclassified, adjust your config before relying on the report.

## Adopt without fixing everything today

```bash
npx autopsia-rn@0.5.0 scan . --update-baseline
npx autopsia-rn@0.5.0 scan . --ci
```

Commit `autopsia.config.json` and `autopsia-baseline.json`. Existing debt stays visible; **new error-level violations fail CI**. In strict mode, incomplete analysis also fails. Never regenerate the baseline automatically in CI.

After a refactor, compare your progress:

```bash
npx autopsia-rn@0.5.0 scan . -o before.json
# Refactor, then:
npx autopsia-rn@0.5.0 scan . --compare before.json
```

See new, resolved and persistent violations, including tolerated debt. Comparison is informational; baseline and CI rules still decide whether a build passes.

## What it checks

| Rule | Example |
|---|---|
| `dependency-direction` | Domain importing a data implementation against its allowed dependencies |
| `direct-data-access` | UI importing configured data clients such as axios or AsyncStorage |
| `forbidden-external` | Domain importing React or another forbidden external package |
| `circular-deps` | An import chain returning to its starting file |

Configure `error`, `warning` or `off` per rule. Document local exceptions with `// autopsia-ignore-next-line <rule> -- reason`. [Examples and fixes](https://github.com/SanBenito12/Autopsia/blob/main/docs/rules.md).

The scanner follows imports, re-exports, `require()` and dynamic `import()`, resolves tsconfig aliases, and records source lines. Strict coverage distinguishes unclassified files, ambiguous layers and unresolved dependencies. Empty layers show `N/A`.

**Scope:** Autopsia verifies configured dependency rules, not overall architectural quality. Type-only imports are excluded from dependency rules. Direct data access checks configured module imports; it does not detect global `fetch()` calls. Excluded files and disabled rules are outside the checks.

## English and Spanish

English is the default in 0.5. For Spanish terminal output and HTML:

```bash
npx autopsia-rn@0.5.0 scan . --lang es --html --open
```

`--lang en|es` works before or after `scan` and `init`. Existing 0.4 baselines remain compatible. JSON retains canonical Spanish `message`/`detail` fields with optional diagnostic metadata; changing presentation language never introduces new debt. Older reports without metadata display their original text.

## Add it to CI

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: 22 }
  - run: npx --yes autopsia-rn@0.5.0 scan . --ci
```

Commit your config and baseline first. [Full workflow with HTML artifacts](https://github.com/SanBenito12/Autopsia/blob/main/docs/ci.md).

## See the result, reproduce the result

![Offline dependency graph from the public fixture](https://raw.githubusercontent.com/SanBenito12/Autopsia/main/docs/graph.png)

The public fixture contains eight files and five intentional violations. [Reproduce a fix](https://github.com/SanBenito12/Autopsia/blob/main/docs/before-after.md) that removes one cycle: **5 → 4 violations, 1 resolved, 0 new**.

The maintainer previously reported 25 findings in under two seconds on one production React Native app of roughly 130 files, with no false positives identified in that review. This is a single reported case, not a general accuracy or performance guarantee. The public demo uses only repository fixtures.

## Where Autopsia fits

[eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) enforces architecture within ESLint; [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) validates and visualizes dependencies. Autopsia focuses on an approachable React Native / TypeScript workflow combining layer detection, legacy baselines, strict analysis coverage and a shareable offline report. Keep ESLint and TypeScript for their own checks.

## Documentation and feedback

- [Getting started](https://github.com/SanBenito12/Autopsia/blob/main/docs/getting-started.md)
- [Configuration and CLI reference](https://github.com/SanBenito12/Autopsia/blob/main/docs/configuration.md)
- [Rules and exceptions](https://github.com/SanBenito12/Autopsia/blob/main/docs/rules.md)
- [CI and migration from 0.4](https://github.com/SanBenito12/Autopsia/blob/main/docs/ci.md)

Trying Autopsia on your app? [Open an issue](https://github.com/SanBenito12/Autopsia/issues) with your folder structure, time to first useful report and any findings you disagree with. Remove private code and secrets from examples.

MIT © Salvador Castillo. Built with TypeScript, ts-morph, commander and D3.
