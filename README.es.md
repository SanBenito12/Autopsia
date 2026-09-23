# 🔬 Autopsia

[![CI](https://github.com/SanBenito12/Autopsia/actions/workflows/ci.yml/badge.svg)](https://github.com/SanBenito12/Autopsia/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/autopsia-rn)](https://www.npmjs.com/package/autopsia-rn)

[English](README.md) · Español

**Evita nuevas violaciones arquitectónicas en tu app React Native sin arreglar toda la deuda heredada primero.**

Autopsia comprueba dependencias TypeScript contra reglas de capas configuradas. Registra la deuda actual como baseline, bloquea errores nuevos en CI y explora un grafo sin conexión.

[Demo interactiva](https://sanbenito12.github.io/Autopsia/report.es.html) · [Guía inicial](https://github.com/SanBenito12/Autopsia/blob/main/docs/getting-started.es.md)

## Primer reporte

Requiere Node 18+. Desde la raíz de tu proyecto:

```bash
npx autopsia-rn@0.5.0 init --lang es
npx autopsia-rn@0.5.0 scan . --lang es --html --open
```

Revisa la configuración y cobertura. `init` detecta nombres comunes bajo `src/` y `src/features/*/`; otras estructuras requieren patrones manuales.

## Adopta con deuda existente

```bash
npx autopsia-rn@0.5.0 scan . --lang es --update-baseline
npx autopsia-rn@0.5.0 scan . --lang es --ci
```

Commitea `autopsia.config.json` y `autopsia-baseline.json`. Los errores nuevos fallan CI; con `strict: true`, el análisis incompleto también falla. La deuda tolerada sigue visible. Nunca regeneres el baseline automáticamente en CI.

Para medir una refactorización, guarda un JSON con `-o before.json` y después ejecuta `scan . --compare before.json --lang es`. La comparación incluye deuda tolerada y no cambia los criterios de CI.

## Reglas y alcance

| Regla | Detecta |
|---|---|
| `dependency-direction` | Dependencias entre capas no permitidas |
| `direct-data-access` | Imports de clientes de datos configurados desde capas restringidas |
| `forbidden-external` | Paquetes externos prohibidos en una capa |
| `circular-deps` | Ciclos de imports |

Cada regla acepta `error`, `warning` u `off`; las excepciones locales usan comentarios `autopsia-ignore`.

Autopsia verifica dependencias según tu configuración; no certifica la calidad completa de la arquitectura. Los imports exclusivamente de tipos se excluyen de las reglas. Las llamadas globales a `fetch()` no se detectan. Los archivos ignorados quedan fuera de la cobertura.

## Idiomas y compatibilidad

0.5 usa inglés por defecto. `--lang es` cambia terminal y HTML y funciona antes o después del subcomando. El JSON conserva `message` y `detail` canónicos en español y añade metadatos opcionales `diagnostic`. Los baselines v1 de 0.4 siguen funcionando; los reportes antiguos sin metadatos muestran su texto original.

## Evidencia reproducible

El fixture público contiene ocho archivos y cinco violaciones intencionales. El [ejemplo antes/después](https://github.com/SanBenito12/Autopsia/blob/main/docs/before-after.md) rompe un ciclo: **5 → 4 violaciones, 1 resuelta, 0 nuevas**.

El mantenedor reportó anteriormente 25 hallazgos en menos de dos segundos sobre una app de producción de unos 130 archivos, sin falsos positivos identificados en esa revisión. Es un caso reportado, no una garantía general de precisión o rendimiento. La demo pública usa únicamente fixtures del repositorio.

## Documentación

- [Primeros pasos](https://github.com/SanBenito12/Autopsia/blob/main/docs/getting-started.es.md)
- [Configuración](https://github.com/SanBenito12/Autopsia/blob/main/docs/configuration.es.md)
- [Reglas y ejemplos](https://github.com/SanBenito12/Autopsia/blob/main/docs/rules.es.md)
- [CI](https://github.com/SanBenito12/Autopsia/blob/main/docs/ci.es.md)

[eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) y [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) también comprueban dependencias arquitectónicas. Autopsia reúne detección de capas, baseline, cobertura estricta y reporte visual para un flujo de adopción en React Native / TypeScript.

Cuéntanos cuánto tardaste en obtener un reporte útil y qué hallazgos no te parecen correctos mediante un [issue](https://github.com/SanBenito12/Autopsia/issues).

MIT © Salvador Castillo.
