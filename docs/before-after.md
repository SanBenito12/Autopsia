# Reproduce a before/after report

This demo uses the public eight-file fixture, not a private production app. It exercises the real CLI in a temporary copy and leaves the original fixture unchanged.

```bash
git clone https://github.com/SanBenito12/Autopsia.git
cd Autopsia
npm ci
npm run build
npm run demo:walkthrough
```

The script scans five violations, saves JSON, breaks the sample helper cycle, and runs `--compare`:

```ts
// Before: helperB.ts
import { a } from './helperA';
export const b = () => a() - 1;

// After: helperB.ts
export const b = () => 1;
```

The fixture helpers illustrate a dependency cycle and have no production behavior to preserve. This is a demonstration of removing an edge, not an automatic refactoring recipe.

Expected result: **5 → 4 violations, 1 resolved, 0 new, 4 persistent**; coverage remains 100%. The remaining violations are intentional.

The script regenerates the offline reports in English and Spanish plus [before](demo-output.txt) and [after](demo-after.txt) terminal transcripts. The screenshots shown in the README come from this public fixture.

## Español

Ejecuta los mismos comandos para reproducir el ejemplo público. El script trabaja en una copia temporal, rompe el ciclo entre helpers y compara los reportes reales: **5 → 4 violaciones, 1 resuelta, 0 nuevas**. El fixture original no cambia. Los helpers no representan lógica de producción; el ejemplo demuestra cómo quitar una dependencia y medir el resultado.
