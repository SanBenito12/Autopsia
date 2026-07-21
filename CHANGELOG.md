# Changelog

## [0.3.1] - 2026-07-21

Patch de claridad basado en scans reales de proyectos layer-first y feature-first.

### Changed

- El reporte muestra porcentaje de cobertura arquitectónica y diferencia entre `ANÁLISIS COMPLETO`, `ANÁLISIS INCOMPLETO` y `CONFIGURACIÓN INSUFICIENTE`; solo declara la arquitectura verificada cuando además no hay violaciones.
- Los problemas de cobertura se agrupan por archivos sin capa, imports sin resolver, capas ambiguas y errores de configuración.
- Las capas con cero archivos muestran `N/A` en terminal y HTML, en vez de un engañoso `100%`.
- El visor HTML muestra cobertura y ya no declara sana una arquitectura con análisis incompleto.
- `autopsia init` mide la cobertura del config generado y advierte cuando clasifica menos del 80% del proyecto.
- Los tests colocados junto al código (`*.test.*`, `*.spec.*`) se ignoran por defecto, igual que `__tests__` y `__mocks__`.

## [0.3.0] - 2026-07-21

Versión enfocada en confianza: Autopsia ahora distingue entre una arquitectura verificada y un análisis que dejó archivos o dependencias sin comprobar.

### Added

- Add strict architecture verification with analysis coverage.
- Detect re-exports, CommonJS `require()`, and dynamic `import()` dependencies.
- Report exact source lines for import-based violations.
- Validate unknown layers, duplicated layers, invalid rule levels, and unknown rules.
- Treat unresolved internal imports and ambiguous/unclassified files as incomplete analysis.
- Generate new configurations with `strict: true`.

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado sigue [SemVer](https://semver.org/lang/es/).

## [0.2.1] - 2026-07-17

Patch release nacido de probar la herramienta en un proyecto real ajeno. Sin breaking changes: solo defaults de `init`/CLI y documentación; el comportamiento de las reglas de análisis no cambia.

### Fixed

- `scan` ahora usa el directorio actual por default: `npx autopsia-rn scan` equivale a `scan .` (mismo criterio que `init`).
- `autopsia init` genera `infrastructure` con `allowedDependencies: ["domain"]` en vez de `[]`. Las dependencias apuntan hacia adentro: un `RepositoryImpl` en infrastructure importa interfaces y errores del domain, y el default anterior marcaba cada implementación de un contrato como violación (falsos positivos masivos). Los configs ya generados no se tocan — ajusta el campo a mano si te afecta.

### Added

- `docs/rules.md`: sección "Casos frecuentes: logging y utilidades transversales" en `dependency-direction` — las tres salidas válidas cuando presentation necesita el logger de infrastructure (interfaz en domain + inyección, hook `useLogger`, o `autopsia-ignore` documentado).

## [0.2.0] - 2026-07-17

Versión enfocada en adopción: que un proyecto legacy pueda instalar Autopsia en 2 minutos sin que le griten 25 errores que no puede arreglar hoy.

### Added

- **Baseline para proyectos legacy**: `scan --update-baseline` guarda las violaciones actuales en `autopsia-baseline.json` (formato estable sin números de línea, rutas POSIX). En scans posteriores las violaciones registradas se reportan en gris como toleradas y no fallan `--ci`; solo las nuevas cuentan. Resumen `X nuevas · Y toleradas`. Flag `--no-baseline` para ignorarlo puntualmente.
- **Comentarios de escape**: `// autopsia-ignore-next-line <regla> [-- razón]` suprime esa violación en la línea siguiente; `// autopsia-ignore-file <regla>` en todo el archivo. Sin nombre de regla se suprimen todas (documentado como mala práctica). Las suprimidas solo se muestran como conteo.
- **Severidad configurable por regla**: sección opcional `"rules"` en el config con niveles `"error"` (default, falla `--ci`), `"warning"` (amarillo, no falla) y `"off"` (no corre). `autopsia init` genera la sección con los defaults explícitos.
- **DX del visor**: `--html` sin valor genera `autopsia-report.html`; nuevo flag `--open` abre el visor con el comando del SO (open / xdg-open / start, sin dependencias). Los scans sin `--html` imprimen un tip de una línea.
- **Documentación para gente nueva**: README reescrito en inglés (`README.md`) y español (`README.es.md`) con Quick Start de 3 comandos y el baseline como primer bloque; guía completa en `docs/` (getting-started con intro a Clean Architecture, rules con ejemplo malo/bueno por regla, configuration, ci); `docs/index.html` convertido en landing.
- **CLI**: ejemplos en `--help` de `scan` e `init`; si no hay config, el error dice exactamente qué correr (`npx autopsia-rn init`).

### Changed

- `autopsia init` ahora incluye la sección `"rules"` en el config generado y explica los niveles en consola.
- El reporte JSON (`-o`) incluye los campos opcionales `tolerated` y `suppressedCount` cuando aplican.

## [0.1.0] - 2026-07-16

Versión inicial, publicada en npm como [`autopsia-rn`](https://www.npmjs.com/package/autopsia-rn).

### Added

- Grafo de dependencias vía AST (ts-morph) con resolución de barrels (`index.ts`) y exclusión de imports `import type`.
- 4 reglas: `dependency-direction`, `direct-data-access`, `forbidden-external`, `circular-deps` (DFS con detección de back-edges).
- `autopsia init`: generador de config detectando la estructura del proyecto bajo `src/`.
- Reporte de terminal con salud por capa, violaciones agrupadas por regla y top de archivos problemáticos; reporte JSON con `-o`.
- Visor HTML interactivo del grafo (`--html`): d3 force-directed, un color por capa, aristas rojas para violaciones.
- Path aliases del tsconfig (`@/*`) resueltos en el grafo (`--tsconfig`).
- Modo CI (`--ci`): exit code 1 si hay violaciones de severidad error.
- Suite de tests (Vitest) y CI en GitHub Actions.

[0.3.1]: https://github.com/SanBenito12/Autopsia/releases/tag/v0.3.1
[0.3.0]: https://github.com/SanBenito12/Autopsia/releases/tag/v0.3.0
[0.2.1]: https://github.com/SanBenito12/Autopsia/releases/tag/v0.2.1
[0.2.0]: https://github.com/SanBenito12/Autopsia/releases/tag/v0.2.0
[0.1.0]: https://github.com/SanBenito12/Autopsia/releases/tag/v0.1.0
