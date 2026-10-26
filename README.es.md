# 🔬 Autopsia

[![CI](https://github.com/SanBenito12/Autopsia/actions/workflows/ci.yml/badge.svg)](https://github.com/SanBenito12/Autopsia/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/autopsia-rn)](https://www.npmjs.com/package/autopsia-rn)
[![macOS DMG](https://img.shields.io/badge/macOS-Descargar%20.dmg-000000?logo=apple)](https://github.com/SanBenito12/Autopsia/releases/latest)
[![MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[English](README.md) · Español

**Evita violaciones de Clean Architecture, fugas de RAM, cuellos de botella de 60fps y crashes en tu app React Native sin arreglar toda la deuda heredada primero.**

Autopsia comprueba dependencias TypeScript y el AST contra reglas de arquitectura, madurez por fases y calidad de producción. Registra la deuda actual como baseline, bloquea errores nuevos en CI y explora tu proyecto en la **App de Escritorio para macOS** o en el grafo HTML sin conexión.

[ Descargar App macOS (.dmg — Apple Silicon)](https://github.com/SanBenito12/Autopsia/releases/latest/download/Autopsia-0.1.0-arm64.dmg) · [ Descargar App macOS (.dmg — Intel)](https://github.com/SanBenito12/Autopsia/releases/latest/download/Autopsia-0.1.0.dmg) · [Demo interactiva](https://sanbenito12.github.io/Autopsia/report.es.html) · [Guía inicial](https://github.com/SanBenito12/Autopsia/blob/main/docs/getting-started.es.md)

## Inicio Rápido (Comandos Cero Fricción)

Requiere Node 18+. Desde la raíz de tu proyecto:

```bash
# 1. Inicializa tu configuración (autodetecta Expo Router, React Native, librerías en package.json y features)
npx autopsia-rn init

# 2. Abre el grafo interactivo HTML en tu navegador con buscador, filtros por capa y enlace clicable
npx autopsia-rn view

# 3. Observa cambios en tiempo real mientras programas
npx autopsia-rn scan --watch

# 4. Configura GitHub Actions en 1 segundo con anotaciones automáticas en tus Pull Requests
npx autopsia-rn setup-ci
```

[Guía de Expo Router](docs/recipes/expo-router.es.md) · [Guía de Aislamiento de Features](docs/recipes/features-architecture.es.md)

## Adopta con deuda existente

```bash
npx autopsia-rn@0.6.0 scan --update-baseline
npx autopsia-rn@0.6.0 scan --ci
```

Commitea `autopsia.config.json` y `autopsia-baseline.json`. Los errores nuevos fallan CI; con `strict: true`, el análisis incompleto también falla. La deuda tolerada sigue visible. Nunca regeneres el baseline automáticamente en CI.

Para medir una refactorización, guarda un JSON con `-o before.json` y después ejecuta `scan . --compare before.json`. La comparación incluye deuda tolerada y no cambia los criterios de CI.

## Reglas y alcance

| Regla | Detecta |
|---|---|
| `feature-boundaries` | Aislamiento de features; prohíbe importar submódulos privados entre features (obliga API pública `index.ts`) |
| `dependency-direction` | Dependencias entre capas no permitidas |
| `direct-data-access` | Imports de clientes de datos configurados o llamadas directas a `fetch()` desde capas restringidas |
| `forbidden-external` | Paquetes externos prohibidos en una capa |
| `circular-deps` | Ciclos de imports |
| `memory-leak` | Timers (`setInterval`/`setTimeout`), suscripciones o `Animated.loop()` en `useEffect` sin limpieza al desmontar |
| `render-bottleneck` | `<Context.Provider value={{...}}>` sin `useMemo` (especialmente con timers), `.filter().map()` en JSX sin `useMemo`, animaciones sin `useNativeDriver`, `console.log` en producción |
| `runtime-safety` | `JSON.parse()` sin `try/catch`, `catch {}` vacíos, estados de carga colgados (`setLoading(true)` sin `finally`), mutación `.sort()` in-place y tokens en `AsyncStorage` plano |
| `scrollview-map` | `<ScrollView>` que pinta listas dinámicas con `.map()` en vez de `FlatList` |
| `flatlist-performance` | `<FlatList>` sin `keyExtractor` o con `renderItem` creado en línea |
| `component-size` | Componentes o hooks que superan el límite de líneas configurado |

Cada regla acepta `error`, `warning` u `off`; las excepciones locales usan comentarios `autopsia-ignore`.

El escáner sigue imports, re-exports, `require()` e `import()` dinámico, resuelve aliases de `tsconfig` y sufijos de plataforma de React Native (`.ios`, `.android`, `.native`, `.web`), y registra las líneas de origen. Autopsia verifica dependencias según tu configuración; no certifica la calidad completa de la arquitectura. Los imports exclusivamente de tipos se excluyen de las reglas. Las llamadas globales a `fetch()` no se detectan. Los archivos ignorados quedan fuera de la cobertura.

## Idiomas y compatibilidad

Desde 0.5, inglés es el idioma por defecto. `--lang es` cambia terminal y HTML y funciona antes o después del subcomando. El JSON conserva `message` y `detail` canónicos en español y añade metadatos opcionales `diagnostic`. Los baselines v1 de 0.4 siguen funcionando; los reportes antiguos sin metadatos muestran su texto original.

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

## Diagnosticar antes de aceptar deuda

`doctor` explica preparación y cobertura: archivos sin capa, coincidencias ambiguas, imports internos sin resolver y problemas al cargar `tsconfig` o sus `extends`. No modifica el proyecto ni comprueba las cuatro reglas: para eso ejecuta `scan`. Guarda todas las incidencias con `doctor . --output doctor.json`; la consola muestra hasta diez.

El preset `react-native` es optativo. Propone `application`, composición (`src/app`, `src/di`, `App.tsx`) y subcarpetas inequívocas de `shared`. No asigna una capa comodín a carpetas ambiguas. Revisa las direcciones permitidas y completa pendientes con ayuda de `doctor`. `--dry-run` nunca escribe, incluso con `--force`.

La exclusión de tipos ahora reconoce imports ordinarios cuyos símbolos TypeScript resuelve exclusivamente como tipos, incluidos alias y reexportaciones con nombres. Imports mixtos, clases, enums, namespaces, reexportaciones `export *`, efectos secundarios y símbolos inciertos conservan aristas. No sustituye el análisis del bundle de Metro.

[Configuración](docs/configuration.es.md) · [Migración 0.5 → 0.6](docs/migration-0.6.es.md)
