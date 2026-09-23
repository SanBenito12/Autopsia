# CI with GitHub Actions

English · [Español](ci.es.md)

Commit your reviewed `autopsia.config.json` and, for a legacy project, `autopsia-baseline.json`. Add `.github/workflows/architecture.yml`:

```yaml
name: Architecture
on:
  pull_request:
  push:
    branches: [main]
jobs:
  autopsia:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Check architecture
        run: npx --yes autopsia-rn@0.5.0 scan . --ci --html autopsia-report.html
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: autopsia-report
          path: autopsia-report.html
```

The explicit version makes updates intentional. `if: always()` preserves the report when a scan finds violations. For Spanish output, append `--lang es`. If your tsconfig extends an installed package or uses workspace resolution, install project dependencies before scanning.

## Adopt with a baseline

Run locally once after reviewing configuration and coverage:

```bash
npx autopsia-rn@0.5.0 init
npx autopsia-rn@0.5.0 scan . --update-baseline
```

Commit both configuration and baseline. CI should run `scan --ci`, never automatically `--update-baseline`. Existing tolerated debt does not fail CI; new error-level occurrences do. Incomplete strict analysis still fails, including an empty scan or a computed import that cannot be resolved statically.

When fixing old debt, regenerate and review the baseline in the same PR. A growing baseline is an explicit architecture decision for reviewers.

## Exit codes and comparisons

- `0`: scan permitted; in CI there are no new errors and strict analysis is complete when enabled.
- `1`: new error-level violations, or incomplete analysis in strict CI. Warnings alone do not fail CI. Existing CLI parsing/init error behavior remains unchanged.
- `2`: invalid configuration, missing required paths, invalid language or comparison report, or an operation that cannot be completed.

`--compare before.json` adds an informational comparison without changing these criteria. It includes tolerated debt and excludes suppressed violations. Keep project/configuration consistent when comparing.

## Upgrading from 0.4

0.5 defaults to English; use `--lang es` to retain Spanish presentation. JSON `message` and `detail` fields and baseline v1 remain canonical Spanish data. Optional `diagnostic` metadata is additive. Old JSON reports without it remain comparable and show their stored text. Language changes do not introduce debt.

## Maintainer validation

Use Node 22 or 24: `npm ci`, `npx tsc --noEmit`, `npm test`, `npm run build`, and `npm run test:package`. The package check installs a tarball in a temporary directory and verifies CLI and offline HTML. CI runs on Linux, Windows and macOS with Node 22/24, plus a minimum Node 18 runtime check.
