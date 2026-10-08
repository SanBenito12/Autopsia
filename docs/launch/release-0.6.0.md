# DRAFT — Autopsia 0.6.0: diagnose before accepting debt

Local release preparation only. No npm publication, tag, PR or deployment has been made for 0.6.0.

- `autopsia doctor`: explain coverage gaps, ambiguous matches, unresolved imports and tsconfig loading problems. Versioned JSON with actionable recommendations.
- Reviewable React Native initialization: `init --preset react-native --dry-run`, application/composition layers and optional exact `files` matches.
- Recognize ordinary imports and named reexports that resolve exclusively to types, removing apparent runtime cycles while retaining uncertain and value-bearing dependencies.
- Preserve version-1 baselines and canonical report identities. Strict CI now rejects incomplete tsconfig loading.
- English and Spanish documentation, migration guide and reproducible fixture demo.

See [migration](../migration-0.6.md) for local tarball installation and compatibility details. Run doctor before recording debt; use scan for rule enforcement.

Before any future release, complete remote Linux/Windows/macOS CI and remove local-preparation notices only when publication is verified. Release remains subject to a separate publishing instruction.
