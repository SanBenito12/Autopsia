# Getting started

Esta guía te lleva de cero a tener Autopsia corriendo en tu proyecto, sin asumir que conoces la herramienta ni Clean Architecture. Si algo no funciona como se muestra aquí, [abre un issue](https://github.com/SanBenito12/Autopsia/issues).

**Requisitos:** Node 18 o superior. Nada más — todos los comandos usan `npx`, sin instalar nada globalmente.

<a id="what-is-clean-architecture"></a>
## ¿Qué es Clean Architecture?

Es una forma de organizar el código en **capas**, donde cada capa solo puede depender de las capas "de adentro". En una app React Native típica:

```
┌──────────────────────────────┐
│        presentation          │   pantallas, componentes, hooks de UI
│    (todo lo que ve React)    │
└──────────────┬───────────────┘
               │  solo puede importar de ↓
┌──────────────▼───────────────┐
│           domain             │   entidades y casos de uso
│     (TypeScript puro:        │   NO sabe que React ni axios existen
│   las reglas del negocio)    │
└──────────────▲───────────────┘
               │  implementa los contratos de ↑
┌──────────────┴───────────────┐
│      data / infrastructure   │   repositorios y clientes: hablan con
│   (la única capa que toca    │   la API, Supabase, AsyncStorage…
│      la red y el storage)    │
└──────────────────────────────┘
```

La regla de oro: **las flechas apuntan hacia adentro**. Una pantalla llama a un caso de uso; el caso de uso usa un repositorio; el repositorio habla con la red. Cuando una pantalla se salta todo y llama `axios.get()` directo, la app sigue funcionando… pero ya no puedes testear la pantalla sin red, ni cambiar de API sin tocar la UI. Autopsia detecta exactamente esos saltos.

## Paso 1 — Genera tu config

Desde la raíz de tu proyecto:

```bash
npx autopsia-rn init
```

`init` busca bajo `src/` carpetas con nombres típicos de cada capa (`presentation`, `ui`, `screens`, `views`, `domain`, `core`, `data`, `repositories`, `infrastructure`, `services`…) y genera `autopsia.config.json`:

```
  Analizando estructura de /tu/proyecto ...

  ✔ Capas detectadas:
    presentation     ← src/presentation
    domain           ← src/domain
    data             ← src/data
    infrastructure   ← src/infrastructure

  Config generado en /tu/proyecto/autopsia.config.json
  Sección "rules": cada regla acepta "error" (falla --ci),
  "warning" (se reporta en amarillo, no falla) u "off" (no corre).
  Pruébalo con: autopsia scan /tu/proyecto
```

Si tu estructura no usa esos nombres, `init` genera un config de **ejemplo** y te avisa. Solo tienes que ajustar los `patterns` de cada capa a tus carpetas reales — la [guía de configuración](configuration.md) muestra cómo, incluyendo estructuras no estándar.

## Paso 2 — Escanea

```bash
npx autopsia-rn scan .
```

Salida real sobre el proyecto de ejemplo del repo:

```
  🔬 AUTOPSIA — Reporte de arquitectura
  /tu/proyecto · 8 archivos analizados

  Salud por capa
  presentation     ██████████░░░░░░░░░░ 50% (4 archivos)
  domain           ██████████░░░░░░░░░░ 50% (2 archivos)
  data             ████████████████████ 100% (1 archivos)
  infrastructure   ████████████████████ 100% (1 archivos)

  ✖ dependency-direction — 2 violación(es)
    src/domain/usecases/GetEventsUseCase.ts
      Capa "domain" no puede depender de "data"
      ↳ importa src/data/repositories/EventRepository.ts
    src/presentation/screens/HomeScreen.tsx
      Capa "presentation" no puede depender de "data"
      ↳ importa src/data/repositories/EventRepository.ts

  ✖ direct-data-access — 1 violación(es)
    src/presentation/screens/HomeScreen.tsx
      Acceso directo a datos/red ("axios") en capa "presentation"
      ↳ Debe pasar por un repositorio o caso de uso

  ✖ forbidden-external — 1 violación(es)
    src/domain/usecases/GetEventsUseCase.ts
      Capa "domain" importa módulo prohibido "axios"
      ↳ La capa debe mantenerse libre de "axios"

  ✖ circular-deps — 1 violación(es)
    src/presentation/screens/helperA.ts
      Dependencia circular detectada (2 archivos)
      ↳ src/presentation/screens/helperA.ts → src/presentation/screens/helperB.ts → src/presentation/screens/helperA.ts

  Top archivos problemáticos
     2  src/domain/usecases/GetEventsUseCase.ts
     2  src/presentation/screens/HomeScreen.tsx

  Total: 5 violaciones en 3 archivos

  Tip: agrega --html --open para ver el grafo interactivo
```

Cómo leerlo:

- **Salud por capa**: porcentaje de archivos de la capa sin violaciones. Es tu métrica de progreso entre scans.
- **Cada violación** dice el archivo, qué regla rompió y el import exacto que la causó (`↳`). Qué significa cada regla y cómo arreglarla: [guía de reglas](rules.md).
- **Top archivos problemáticos**: por dónde empezar — arreglar los archivos con más violaciones rinde más.

Si tu proyecto usa path aliases (`@/domain/...`), Autopsia usa el `tsconfig.json` de la raíz escaneada automáticamente; si el tuyo está en otra parte: `--tsconfig ./tsconfig.app.json`.

## Paso 3 — El grafo interactivo

```bash
npx autopsia-rn scan . --html --open
```

Genera `autopsia-report.html` (autocontenido, lo puedes compartir o subir a tu CI como artifact) y lo abre en el navegador: cada nodo es un archivo, cada color una capa, y las **aristas rojas** son los imports que violan reglas. [Demo en vivo →](https://sanbenito12.github.io/Autopsia/report.html)

<a id="adopting-autopsia-in-a-legacy-project"></a>
## Adopción en un proyecto legacy (baseline)

Un proyecto real con historia va a arrojar violaciones — quizá muchas. No tienes que arreglarlas hoy para adoptar la herramienta:

```bash
npx autopsia-rn scan . --update-baseline
```

```
  Total: 25 violaciones en 12 archivos

  ✔ Baseline guardado en /tu/proyecto/autopsia-baseline.json
    25 violación(es) tolerada(s). Los próximos scans solo fallarán con violaciones NUEVAS.
```

A partir de ahí:

- Las violaciones registradas se reportan en gris como **toleradas** y `--ci` no falla por ellas. El resumen dice `X nuevas · Y toleradas`.
- Una violación **nueva** (un import que no estaba) sí falla. La arquitectura no puede empeorar.
- Cuando arregles violaciones viejas, vuelve a correr `--update-baseline`: salen del baseline y ya no pueden regresar.
- **Commitea `autopsia-baseline.json`** para que todo el equipo (y el CI) tolere lo mismo.
- ¿Quieres ver el panorama completo, con todo lo tolerado en rojo? `npx autopsia-rn scan . --no-baseline`.

El baseline guarda regla + archivo + detalle, **sin números de línea**: editar un archivo no invalida sus entradas.

## Siguientes pasos

- [Reglas](rules.md) — qué detecta cada una, con el código malo, el fix, y cómo suprimir un caso legítimo con `// autopsia-ignore-next-line`
- [Configuración](configuration.md) — capas con nombres no estándar, severidad por regla (`error`/`warning`/`off`), módulos de datos propios
- [CI](ci.md) — GitHub Actions con baseline en 5 minutos
