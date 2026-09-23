# Getting started

English · [Español](getting-started.es.md)

Stop new architecture violations without fixing all your legacy debt first. Requires Node 18 or newer. Run commands from your project root.

## What is Clean Architecture?

Organize code into layers with explicit dependency directions. A typical setup is:

```text
presentation → domain ← data
                  ↑       ↓
             infrastructure
```

The UI uses domain contracts and use cases. Data and infrastructure implement those contracts. The domain does not import React or networking libraries. These are configurable boundaries, not an assessment of every aspect of software design.

## 1. Generate and review your config

```bash
npx autopsia-rn@0.5.0 init
```

Autopsia detects common layer names under `src/` and `src/features/<feature>/`. If it cannot recognize your structure, it generates an example and tells you to adjust it. Review `patterns`, `allowedDependencies`, and `dataAccessModules` in `autopsia.config.json`.

Low coverage means the configuration needs work. Baselines do not excuse unclassified files, ambiguous patterns, unresolved internal dependencies or computed imports in strict CI. See [configuration](configuration.md).

## 2. Run a scan

```bash
npx autopsia-rn@0.5.0 scan .
npx autopsia-rn@0.5.0 scan . --html --open
```

The terminal shows coverage, violations with source lines, and files with the most violations. The offline HTML graph colors files by layer and highlights violating internal dependencies in red. [Explore the sample report](https://sanbenito12.github.io/Autopsia/report.html).

For a reproducible run on the public eight-file fixture, clone this repository, run `npm ci`, then `npm run scan:fixture`. It reports five violations. See [the before/after walkthrough](before-after.md) to fix one and compare the results.

Layer health is the percentage of classified files without violations, including tolerated debt. Empty layers show `N/A`. Health is not a general software-quality score.

## Adopting Autopsia in a legacy project

Record existing violations once:

```bash
npx autopsia-rn@0.5.0 scan . --update-baseline
npx autopsia-rn@0.5.0 scan . --ci
```

Commit `autopsia.config.json` and `autopsia-baseline.json`. CI then fails on **new error-level violations**, or on incomplete analysis with `strict: true`. Existing baseline debt remains visible and does not fail CI by itself.

After fixing old violations, review and regenerate the baseline in the same PR. Do not automatically regenerate it in CI: that would accept newly introduced debt. Additional occurrences of a known violation count as new; moving source lines does not.

Use `--no-baseline` to inspect all debt. Baselines remain version 1 and preserve their canonical Spanish identity fields.

## English and Spanish

```bash
npx autopsia-rn@0.5.0 --lang es init
npx autopsia-rn@0.5.0 scan . --lang es --html
```

English is the default. `--lang en|es` selects terminal and HTML presentation. JSON keeps canonical Spanish diagnostic text; optional `diagnostic` metadata supports translated presentation. Older reports without metadata retain their original text when displayed. Changing language never changes rule results or baseline identity.

## Limits and next steps

Autopsia checks configured dependency rules for included TypeScript files. Type-only imports are excluded from dependency rules. Direct data access means importing configured modules; global `fetch()` calls are not detected. ESLint and TypeScript remain useful alongside it.

- [Rules and fixes](rules.md)
- [Configuration and CLI flags](configuration.md)
- [CI with baseline](ci.md)
