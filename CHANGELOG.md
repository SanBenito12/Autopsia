# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado sigue [SemVer](https://semver.org/lang/es/).

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

[0.2.0]: https://github.com/SanBenito12/Autopsia/releases/tag/v0.2.0
[0.1.0]: https://github.com/SanBenito12/Autopsia/releases/tag/v0.1.0
