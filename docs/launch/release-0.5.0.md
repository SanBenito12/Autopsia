# Autopsia 0.5.0 — English and Spanish, compatible with your existing debt

Stop new architecture violations in React Native / TypeScript without fixing all legacy debt first.

- English by default; `--lang es` selects Spanish for help, diagnostics and offline HTML.
- Existing 0.4 baselines and comparisons remain compatible. JSON keeps canonical Spanish identity fields and adds optional diagnostic metadata.
- Bilingual guides and landing, explicit scanner limits, and a public before/after walkthrough.
- Responsive offline graph and refreshed screenshots from the public fixture.

```bash
npx autopsia-rn@0.5.0 init
npx autopsia-rn@0.5.0 scan . --html --open
npx autopsia-rn@0.5.0 scan . --lang es
```

Review configuration/coverage before recording a baseline. CI fails on new errors or incomplete strict analysis. Type-only imports are excluded from dependency rules; global `fetch()` calls are not detected.

[Demo](https://sanbenito12.github.io/Autopsia/) · [Migration and CI](https://github.com/SanBenito12/Autopsia/blob/main/docs/ci.md) · [Reproducible example](https://github.com/SanBenito12/Autopsia/blob/main/docs/before-after.md)
