# 🔬 Autopsia

[![CI](https://github.com/SanBenito12/Autopsia/actions/workflows/ci.yml/badge.svg)](https://github.com/SanBenito12/Autopsia/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/autopsia-rn)](https://www.npmjs.com/package/autopsia-rn)
[![macOS DMG](https://img.shields.io/badge/macOS-Download%20.dmg-000000?logo=apple)](https://github.com/SanBenito12/Autopsia/releases/latest)
[![MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

English · [Español](README.es.md)

**Stop new architecture violations, RAM leaks, 60fps bottlenecks and runtime crashes in your React Native app—without fixing all your legacy debt first.**

Autopsia checks your TypeScript dependencies and AST against Clean Architecture and production readiness rules. Record today's debt as a baseline, block new errors in CI, and explore your project in the **macOS Desktop App** or offline HTML dependency graph.

[ Download macOS App (.dmg — Apple Silicon)](https://github.com/SanBenito12/Autopsia/releases/latest/download/Autopsia-0.1.0-arm64.dmg) · [ Download macOS App (.dmg — Intel)](https://github.com/SanBenito12/Autopsia/releases/latest/download/Autopsia-0.1.0.dmg) · [Try the interactive demo](https://sanbenito12.github.io/Autopsia/report.html) · [Get started](https://github.com/SanBenito12/Autopsia/blob/main/docs/getting-started.md) · [Website](https://sanbenito12.github.io/Autopsia/)

![Actual CLI output from the public sample fixture](https://raw.githubusercontent.com/SanBenito12/Autopsia/main/docs/demo.png)

## Quickstart (Zero-Friction Commands)

Requires Node 18+. Run from your project root:

```bash
# 1. Initialize configuration (auto-detects Expo Router, React Native, package.json libraries & features)
npx autopsia-rn init

# 2. View the interactive HTML graph with search, layer filters & clickable terminal link
npx autopsia-rn view

# 3. Watch for changes in real time during development
npx autopsia-rn scan --watch

# 4. Set up GitHub Actions CI in 1 second with inline Pull Request annotations
npx autopsia-rn setup-ci
```

[Expo Router Guide](docs/recipes/expo-router.md) · [Feature Boundaries Guide](docs/recipes/features-architecture.md)

## Adopt without fixing everything today

```bash
npx autopsia-rn@0.6.0 scan . --update-baseline
npx autopsia-rn@0.6.0 scan . --ci
```

Commit `autopsia.config.json` and `autopsia-baseline.json`. Existing debt stays visible; **new error-level violations fail CI**. In strict mode, incomplete analysis also fails. Never regenerate the baseline automatically in CI.

After a refactor, compare your progress:

```bash
npx autopsia-rn@0.6.0 scan . -o before.json
# Refactor, then:
npx autopsia-rn@0.6.0 scan . --compare before.json
```

See new, resolved and persistent violations, including tolerated debt. Comparison is informational; baseline and CI rules still decide whether a build passes.

## What it checks

| Rule | Example |
|---|---|
| `feature-boundaries` | Forbids importing private internals across features; enforces Public API (`index.ts`) |
| `dependency-direction` | Domain importing a data implementation against its allowed dependencies |
| `direct-data-access` | UI importing configured data clients (`axios`, `AsyncStorage`) or calling global `fetch()` directly |
| `forbidden-external` | Domain importing React or another forbidden external package |
| `circular-deps` | An import chain returning to its starting file |
| `memory-leak` | `setInterval`/`setTimeout`, event listeners, or `Animated.loop()` in `useEffect` without unmount cleanup |
| `render-bottleneck` | Unmemoized `<Context.Provider value={{...}}>` (especially with timers), JSX `.filter().map()` chains without `useMemo`, missing `useNativeDriver`, `console.log` in production |
| `runtime-safety` | Unprotected `JSON.parse()`, empty `catch {}`, stuck loading states (`setLoading(true)` without `finally`), in-place `.sort()` mutations, plaintext tokens in `AsyncStorage` |
| `scrollview-map` | `<ScrollView>` rendering dynamic `.map()` lists instead of `FlatList` |
| `flatlist-performance` | `<FlatList>` missing `keyExtractor` or passing inline `renderItem` |
| `component-size` | React components or custom hooks exceeding configured line limits |

Configure `error`, `warning` or `off` per rule. Document local exceptions with `// autopsia-ignore-next-line <rule> -- reason`. [Examples and fixes](https://github.com/SanBenito12/Autopsia/blob/main/docs/rules.md).

The scanner follows imports, re-exports, `require()` and dynamic `import()`, resolves tsconfig aliases and React Native platform suffixes (`.ios`, `.android`, `.native`, `.web`), and records source lines. Strict coverage distinguishes unclassified files, ambiguous layers and unresolved dependencies. Empty layers show `N/A`.

**Scope:** Autopsia verifies configured dependency rules, not overall architectural quality. Type-only imports are excluded from dependency rules. Direct data access checks configured module imports; it does not detect global `fetch()` calls. Excluded files and disabled rules are outside the checks.

## English and Spanish

English has been the default since 0.5. For Spanish terminal output and HTML:

```bash
npx autopsia-rn@0.6.0 scan . --lang es --html --open
```

`--lang en|es` works before or after `scan` and `init`. Existing 0.4 baselines remain compatible. JSON retains canonical Spanish `message`/`detail` fields with optional diagnostic metadata; changing presentation language never introduces new debt. Older reports without metadata display their original text.

## Add it to CI

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: 22 }
  - run: npx --yes autopsia-rn@0.6.0 scan . --ci
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

## Diagnose before accepting debt

`doctor` explains readiness and coverage: unclassified files, ambiguous matches, unresolved internal imports and failures loading `tsconfig` or its `extends` chain. It does not modify the project or evaluate the four dependency rules: use `scan` for those. Save all issues with `doctor . --output doctor.json`; the terminal shows up to ten.

The `react-native` preset is opt-in. It proposes `application`, composition (`src/app`, `src/di`, `App.tsx`) and unambiguous layer subfolders of `shared`. It never assigns a catch-all layer to ambiguous folders. Review allowed directions and resolve remaining gaps with `doctor`. `--dry-run` never writes, even with `--force`.

Type exclusion now recognizes ordinary imports whose TypeScript symbols resolve exclusively to types, including aliases and named reexports. Mixed imports, classes, enums, namespaces, `export *`, side effects and uncertain symbols retain edges. This does not reproduce Metro's bundling transformations.

[Configuration](docs/configuration.md) · [Migration 0.5 → 0.6](docs/migration-0.6.md)
