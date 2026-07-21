# 🔬 Autopsia

[![CI](https://github.com/SanBenito12/Autopsia/actions/workflows/ci.yml/badge.svg)](https://github.com/SanBenito12/Autopsia/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/autopsia-rn)](https://www.npmjs.com/package/autopsia-rn)
![license](https://img.shields.io/badge/license-MIT-green)

**🇪🇸 [Leer en español](README.es.md)**

A CLI that audits your **React Native / TypeScript** project against **Clean Architecture** rules — it finds the imports that break your layers, in seconds.

![Demo](docs/demo.png)

## Why?

Somebody ships a screen that calls `axios.get()` directly. It works, everyone moves on. Six months later you can't write a test for that screen without mocking the network, and when the API changes you're hunting through 40 UI files instead of one repository. Autopsia catches that import the day it appears — like ESLint, but for your architecture instead of your syntax.

*New to Clean Architecture? There's a [10-line explanation with a diagram](docs/getting-started.md#what-is-clean-architecture) in the guide — the short version: UI code shouldn't talk to the network directly, and your business logic shouldn't know React exists.*

## Quick Start

Three commands, no install:

```bash
npx autopsia-rn init          # 1. detects your layers, writes autopsia.config.json
npx autopsia-rn scan .        # 2. audits the project
npx autopsia-rn scan . --html --open   # 3. opens the interactive dependency graph
```

What you'll see:

```
  🔬 AUTOPSIA — Architecture report
  . · 8 files analyzed

  Salud por capa
  presentation     ██████████░░░░░░░░░░ 50% (4 archivos)
  domain           ██████████░░░░░░░░░░ 50% (2 archivos)

  ✖ direct-data-access — 1 violación(es)
    src/presentation/screens/HomeScreen.tsx
      Acceso directo a datos/red ("axios") en capa "presentation"
      ↳ Debe pasar por un repositorio o caso de uso

  Total: 5 violaciones en 3 archivos
```

If `init` doesn't recognize your folder structure, it writes an example config — adjusting it takes a minute with the [configuration guide](docs/configuration.md).

## Already have violations? (every real project does)

You don't have to fix 25 violations before adopting the tool. Record what exists today as a **baseline**; from then on only **new** violations fail:

```bash
npx autopsia-rn scan . --update-baseline   # tolerates everything that exists today
npx autopsia-rn scan . --ci                # ✅ passes — will only fail on NEW violations
```

Commit `autopsia-baseline.json` and your legacy debt stops screaming at you while you pay it down. Details in the [getting started guide](docs/getting-started.md#adopting-autopsia-in-a-legacy-project).

## Strict verification

New configs include `"strict": true`. In strict mode Autopsia never calls an architecture healthy when something was left unchecked:

- every TypeScript file must belong to exactly one layer;
- every internal dependency must resolve;
- layer patterns cannot be ambiguous;
- every layer and rule referenced by the config must exist.

The scanner follows `import`, re-exports (`export ... from`), `require()`, and dynamic `import()`, and reports exact source lines. In CI, incomplete analysis fails even when no violation was found:

```text
Analysis coverage
Classified files              438 / 438
Internal dependencies        1284 resolved · 0 unresolved
✔ Complete analysis: no architectural boundary was left unchecked
```

This certifies **compliance with every configured architecture rule**. ESLint and TypeScript remain responsible for syntax, types, and style.

## Interactive graph

`--html --open` generates a self-contained viewer: force-directed dependency graph, one color per layer, red edges for violating imports.

🔗 **[Live demo](https://sanbenito12.github.io/Autopsia/report.html)** · [docs site](https://sanbenito12.github.io/Autopsia/)

## Rules

| Rule | What it catches |
|---|---|
| [`dependency-direction`](docs/rules.md#dependency-direction) | A layer importing from a layer it shouldn't (e.g. `domain → data`) |
| [`direct-data-access`](docs/rules.md#direct-data-access) | Screens/UI calling axios, Supabase, AsyncStorage directly |
| [`forbidden-external`](docs/rules.md#forbidden-external) | Domain contaminated with React, react-native, axios, … |
| [`circular-deps`](docs/rules.md#circular-deps) | Import cycles (A → B → A), direct or transitive |

Every rule can be set to `"error"`, `"warning"` or `"off"` per project, and any single violation can be suppressed with a documented `// autopsia-ignore-next-line` comment. The [rules guide](docs/rules.md) shows bad code, the fix, and why it matters — for each rule.

## CI

Fail the build only on new violations:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: 20 }
  - run: npx autopsia-rn scan . --ci
```

Full recipe (with baseline and PR comments): [docs/ci.md](docs/ci.md).

## Tested on a real production app

Scanned a production React Native app (~130 files): **25 violations in under 2 seconds, zero false positives**. 3 files concentrated ~50% of the violations — the report doubles as a prioritized refactor plan.

![Real report](docs/case-study.png)

## Documentation

- 📖 [Getting started](docs/getting-started.md) — step by step, with real output, plus a crash intro to Clean Architecture
- 📏 [Rules](docs/rules.md) — bad example, good example, and how to ignore each rule legitimately
- ⚙️ [Configuration](docs/configuration.md) — every field of `autopsia.config.json`
- 🤖 [CI](docs/ci.md) — GitHub Actions recipe with baseline

## Roadmap

- [x] Interactive graph viewer (`--html --open`)
- [x] tsconfig path aliases (`@/*`) resolved in the graph
- [x] `autopsia init` — config generator that detects your structure
- [x] Baseline for legacy projects (`--update-baseline`)
- [x] `autopsia-ignore` escape comments
- [x] Per-rule severity (`error` / `warning` / `off`)
- [ ] Historical comparison (`--compare previous-report.json`)
- [ ] More rules: god files, business logic in components, orphan files

## Stack

Node · TypeScript · ts-morph (AST) · commander · chalk

## License

MIT
