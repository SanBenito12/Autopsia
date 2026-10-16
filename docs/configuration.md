# Configuration

> Guide for the local 0.6.0 preparation, not yet published. [Local installation and migration](migration-0.6.md).

English · [Español](configuration.es.md)

`autopsia.config.json` lives in the scanned project root. Generate it with `npx autopsia-rn@0.6.0 init`, then review it against your actual architecture.

```json
{
  "layers": [
    { "name": "presentation", "patterns": ["src/presentation/*"], "allowedDependencies": ["domain"] },
    { "name": "domain", "patterns": ["src/domain/*"], "allowedDependencies": [], "forbiddenExternal": ["react", "react-native", "axios", "@supabase"] },
    { "name": "data", "patterns": ["src/data/*"], "allowedDependencies": ["domain", "infrastructure"] },
    { "name": "infrastructure", "patterns": ["src/infrastructure/*"], "allowedDependencies": ["domain"] }
  ],
  "dataAccessModules": ["axios", "@supabase/supabase-js", "@react-native-async-storage/async-storage"],
  "noDirectDataAccessIn": ["presentation"],
  "strict": true,
  "ignore": ["src/legacy"],
  "rules": {
    "dependency-direction": "error",
    "direct-data-access": "error",
    "forbidden-external": "error",
    "circular-deps": "error"
  }
}
```

## Layers

| Field | Behavior |
|---|---|
| `name` | Unique layer name used in reports and dependency restrictions. |
| `patterns` | Case-insensitive path patterns. `*` matches any characters including subdirectories. Without `*`, matching uses a substring. |
| `allowedDependencies` | Allowed target layers. `[]` forbids other-layer dependencies. Omission means unrestricted. Same-layer imports remain allowed. |
| `forbiddenExternal` | Forbidden package names or package prefixes: `@supabase` matches `@supabase/supabase-js`. |

The first matching layer classifies a file, but multiple matches are reported as ambiguous and fail strict CI. Resolve overlaps instead of relying on ordering. Unclassified files are not checked against layer rules and reduce analysis coverage.

Default directions: `presentation → domain`, `data → domain + infrastructure`, `infrastructure → domain`, and no outward dependencies from `domain`. Infrastructure may implement domain contracts. Configure composition roots and shared utilities explicitly for your own project.

`init` recognizes typical folders directly under `src/` and one feature level under `src/features/`. It reports up to five unclassified examples when coverage is below 80%. It does not infer inter-feature boundaries or monorepo policies.

Custom patterns can match `app/*`, `src/components/*`, or `packages/domain/*`; these require manual configuration when initialization does not recognize them.

## Strict analysis

Generated configs use `strict: true`. In CI it requires a non-empty scan, exactly one layer per included file, resolved internal dependencies and valid configuration. Computed `import(variable)` and `require(variable)` prevent complete analysis. String literals and templates without interpolation are supported.

With strict mode disabled, coverage issues are reported but do not independently fail CI. Invalid configuration is still rejected. Type-only dependencies are recorded for analysis but excluded from dependency rules.

## Data modules, ignores and severity

`dataAccessModules` lists external packages considered data/network access. `noDirectDataAccessIn` lists layers where importing those packages is forbidden. Add the clients your project actually uses. Global `fetch()` is not a module import and is not detected.

`ignore` adds paths to exclusions. Built-in exclusions include `node_modules`, `dist`, `build`, `.git`, `coverage`, `__tests__`, `__mocks__`, and colocated `*.test.*` / `*.spec.*` files. Excluded files are outside the coverage denominator.

Each rule accepts `error` (fails CI for new violations), `warning` (reported without failing), or `off` (not evaluated). Omitted rule levels default to `error`. Configuration lists must contain non-empty strings; `strict` must be boolean and `rules` an object.

## Baseline and comparisons

`autopsia-baseline.json` is separate from the configuration. `--update-baseline` records current unsuppressed debt; commit and review it. `--no-baseline` ignores it for one scan.

`--compare before.json` reports new, resolved and persistent occurrences, including tolerated debt, plus classified-file coverage changes. It does not alter CI decisions or update the baseline. Compare the same project and configuration; changing rules or patterns also changes results. Reports without coverage metadata show `N/A`.

## CLI reference

| Flag | Behavior |
|---|---|
| `--lang en\|es` | Terminal and HTML language; English by default. Accepted before or after subcommand. |
| `-c, --config <file>` | Config path; normally `autopsia.config.json` in the scanned root. |
| `-o, --output <file>` | Write the complete canonical JSON report. |
| `--html [file]` | Generate offline HTML; defaults to `autopsia-report.html`. |
| `--open` | Open HTML in the browser; implies `--html`. |
| `--ci` | Fail on new errors or incomplete strict analysis. |
| `--update-baseline` | Record current debt. |
| `--no-baseline` | Ignore saved baseline. |
| `--compare <file>` | Compare against a previous JSON report. |
| `--tsconfig <file>` | Explicit tsconfig for path aliases; defaults to the scanned root's tsconfig. |

`scan` defaults to the current directory. `init --force` overwrites an existing configuration. Language never changes JSON identity fields or baseline matching. Optional diagnostic metadata is additive; old report text remains displayable.

## Reviewable preset and exact paths

`init --preset react-native --dry-run` previews the proposal without writing; omit `--dry-run` to create it. Without `--preset`, previous detection remains available. Neither mode overwrites without `--force`.

| Layer | allowedDependencies |
|---|---|
| presentation | application, domain |
| application | domain |
| data | infrastructure, domain |
| infrastructure | domain |
| domain | [] |
| composition | All other detected layers |

Only present target layers are included. The preset adds `src/application`, `src/features/*/application`, `src/app`, `src/di` and the root `App.tsx`. Under `src/shared` and `src/features/*/shared`, only `presentation`, `application`, `domain`, `data` and `infrastructure` subfolders are recognized. Ambiguous folders such as `utils`, `context`, `store` and `config` remain pending; inter-feature boundaries are not inferred.

```json
{ "name": "composition", "files": ["App.tsx"], "patterns": ["src/app/*", "src/di/*"], "allowedDependencies": ["presentation", "domain"] }
```

`files` is optional: exact paths relative to the root, case-sensitive and using `/`. Absolute paths, wildcards, empty segments, `.` and `..` are rejected. A layer needs at least one entry in `patterns` or `files`; both can be combined. `files: ["App.tsx"]` does not match `src/App.tsx`. Patterns retain their previous semantics. Matches across different layers remain ambiguous, whether exact or pattern-based.

## doctor

```bash
npx autopsia-rn@0.6.0 doctor . --lang es --output doctor.json
npx autopsia-rn@0.6.0 doctor . --config autopsia.config.json --tsconfig tsconfig.json
```

Accepts `[path]`, `-c/--config`, `--tsconfig`, `-o/--output` and `--lang en|es` before or after the subcommand. `0`: ready without blockers; `1`: incomplete readiness/coverage; `2`: invalid arguments, malformed configuration or execution failure.

Stable JSON uses `schemaVersion: 1`, `status` (`ready`, `incomplete`, `error`), configuration paths, `typescriptVersion`, `totalFiles`, `coverage` (null when unavailable), `detected` and `issues`. Each issue contains `code`, canonical message, recommendation, translation metadata and location when available. Ambiguities include `matches` with layer, patterns and exact files. Language changes only terminal presentation, not JSON. Recommendations are never applied automatically.
