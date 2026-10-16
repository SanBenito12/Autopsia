# Migrating to 0.6

English · [Español](migration-0.6.es.md)

**Local preparation: 0.6.0 has not been published.** The current npm release remains 0.5.0. Do not run the versioned 0.6 npm examples until it is available.

## Test the local package

From the Autopsia checkout, build and pack it into an existing output directory outside your app:

```bash
npm run build
npm pack --ignore-scripts --pack-destination /absolute/path/to/output
```

Run the packed CLI against an isolated copy of your app (replace the tarball and app paths):

```bash
npm exec --yes --package=/absolute/path/to/output/autopsia-rn-0.6.0.tgz -- autopsia --version
npm exec --yes --package=/absolute/path/to/output/autopsia-rn-0.6.0.tgz -- autopsia init /absolute/path/to/app --preset react-native --dry-run
npm exec --yes --package=/absolute/path/to/output/autopsia-rn-0.6.0.tgz -- autopsia doctor /absolute/path/to/app
```

`--dry-run` and `doctor` do not write configuration or baseline files. `doctor --output` explicitly writes the requested report. Review the proposal before running `init` without `--dry-run`. Existing configs are protected unless `--force` is given.

## Existing configuration and debt

Keep your configuration and version-1 baseline. No conversion or baseline regeneration is required. New `files` entries are optional exact relative paths; existing patterns keep their previous behavior. The React Native preset is opt-in and does not retrofit existing configurations.

Imports whose resolved symbols are exclusively types now lose their runtime edges even without an explicit `import type`. Some old findings may therefore be resolved. Unchanged findings keep their canonical identity; additional occurrences still count as new. Spanish canonical `message`/`detail` and optional diagnostic metadata remain independent of presentation language. Old reports without metadata remain displayable and comparable.

Compare reports made with the **same config** to isolate detector changes. If you also adopt a preset, make a separate comparison: changes in policy or coverage are not detector regressions. Review a sample of findings with the team before tolerating them.

## Stricter preparation checks

Missing or invalid base tsconfigs now produce analysis issues. Strict `scan --ci` fails when configuration loading is incomplete, including after debt has been recorded. `doctor` explains the failure and recommended next step; it does not install dependencies or edit paths. Ordinary application type errors remain the responsibility of TypeScript.

Exit codes for doctor: 0 ready, 1 incomplete preparation/coverage, 2 invalid arguments, malformed configuration or execution failure. Doctor readiness does not mean the dependency rules pass: run `scan --ci` too.

## Remaining limits

The scanner includes TS/TSX files; it does not discover JS/JSX entry files. Mixed imports, value-bearing symbols, namespaces, star reexports, side-effect imports and uncertain symbols retain edges. This is not a reproduction of Metro's full transformation pipeline. Configured module imports are checked; global `fetch()` calls are not. Complete classification is not a certification of architectural quality.

Doctor also reports the TypeScript engine version bundled with Autopsia. A project using newer compiler options or library names can require a newer analyzer even when its own compiler accepts its configuration. Do not treat that as a defect in application code.
