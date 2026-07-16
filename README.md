# 🔬 Autopsia

[![CI](https://github.com/SanBenito12/Autopsia/actions/workflows/ci.yml/badge.svg)](https://github.com/SanBenito12/Autopsia/actions/workflows/ci.yml)

![Demo](docs/demo.png)

> ESLint te dice si tu código está bien escrito. **Autopsia te dice si tu arquitectura está bien construida.**

CLI de análisis estático que audita proyectos **React Native / TypeScript** contra las reglas de **Clean Architecture**: construye el grafo de dependencias vía AST y detecta violaciones entre capas en segundos.

## ¿Por qué?

Auditar manualmente la arquitectura de una app toma horas: abrir cada pantalla, revisar sus imports, rastrear si un `axios.get` se coló en la UI. Autopsia automatiza exactamente ese proceso. Nació de una auditoría manual a una app en producción donde encontré 6 pantallas importando la capa de datos directamente — esta herramienta lo detecta en menos de un segundo.

## Instalación y uso

```bash
# Vía npx (próximamente en npm)
npx autopsia-rn scan ./mi-proyecto

# Genera el config detectando la estructura del proyecto
npx autopsia-rn init ./mi-proyecto
```

Desde el repositorio:

```bash
npm install
npm run dev -- scan ./mi-proyecto --config autopsia.config.json

# Con reporte JSON
npm run dev -- scan ./mi-proyecto -o reporte.json

# Modo CI (exit code 1 si hay violaciones → quality gate)
npm run dev -- scan ./mi-proyecto --ci

# Proyectos con path aliases (@/domain/...): se usa el tsconfig.json de la
# raíz escaneada automáticamente, o indica uno explícito
npm run dev -- scan ./mi-proyecto --tsconfig ./mi-proyecto/tsconfig.app.json

# Visor HTML interactivo del grafo (d3 force-directed, dark theme)
npm run dev -- scan ./mi-proyecto --html reporte.html
```

Prueba rápida con los fixtures incluidos:

```bash
npm run scan:fixture   # fixture clásico con las 4 reglas
npm run scan:alias     # fixture con path aliases (@/*) resueltos vía tsconfig
npm run demo:html      # genera demo/report.html con el visor interactivo
```

## Reglas implementadas

| Regla | Qué detecta | Severidad |
|---|---|---|
| `dependency-direction` | Capas dependiendo de capas prohibidas (ej. `domain → data`) | error |
| `direct-data-access` | Pantallas/UI llamando axios, Supabase, AsyncStorage directamente | error |
| `forbidden-external` | Domain contaminado con React, react-native, axios, etc. | error |
| `circular-deps` | Ciclos de imports (A → B → A), directos o transitivos | error |

Los imports `import type` se **excluyen** de las reglas de dependencia (no generan acoplamiento en runtime). Los barrels (`index.ts`) se resuelven al archivo real para que no "laven" violaciones.

## Probado en proyectos reales

Escaneé una app React Native **en producción** (~130 archivos, con múltiples roles de usuario) para validar la herramienta fuera de los fixtures:

- **25 violaciones detectadas en menos de 2 segundos**, todas de `dependency-direction`: hooks y contexts de la capa `presentation` importando `data/sources` directamente, saltándose la capa `domain`.
- **Cero falsos positivos**, y cero violaciones de `direct-data-access` — el acceso a red ya estaba correctamente centralizado en `data`, y Autopsia lo confirmó en lugar de inventar ruido.
- El reporte reveló un **alto fan-in**: solo 3 servicios (`auth`, `usersgestor`, `invitations`) concentran ~50% de las violaciones. Eso convierte el reporte en un plan de refactor priorizado: atacar esos 3 archivos primero resuelve la mitad del problema.

![Reporte real](docs/case-study.png)

## Configuración

`autopsia.config.json` define tus capas por patrones de ruta y sus reglas:

```json
{
  "layers": [
    { "name": "presentation", "patterns": ["src/presentation/*"], "allowedDependencies": ["domain"] },
    { "name": "domain", "patterns": ["src/domain/*"], "allowedDependencies": [], "forbiddenExternal": ["react", "react-native", "axios", "@supabase"] },
    { "name": "data", "patterns": ["src/data/*"], "allowedDependencies": ["domain", "infrastructure"] },
    { "name": "infrastructure", "patterns": ["src/infrastructure/*"], "allowedDependencies": [] }
  ],
  "dataAccessModules": ["axios", "@supabase/supabase-js", "@react-native-async-storage/async-storage"],
  "noDirectDataAccessIn": ["presentation"]
}
```

## Ejemplo de salida

```
  🔬 AUTOPSIA — Reporte de arquitectura
  ./sample-app · 8 archivos analizados

  Salud por capa
  presentation     ██████████░░░░░░░░░░ 50% (4 archivos)
  domain           ██████████░░░░░░░░░░ 50% (2 archivos)
  data             ████████████████████ 100% (1 archivos)
  infrastructure   ████████████████████ 100% (1 archivos)

  ✖ direct-data-access — 1 violación(es)
    src/presentation/screens/HomeScreen.tsx
      Acceso directo a datos/red ("axios") en capa "presentation"
      ↳ Debe pasar por un repositorio o caso de uso

  Total: 5 violaciones en 3 archivos
```

## Arquitectura

```
src/
├── index.ts          # CLI (commander)
├── scanner.ts        # Grafo de dependencias vía AST (ts-morph)
├── classifier.ts     # Clasificación de archivos en capas
├── reporter.ts       # Salida terminal + JSON + métricas de salud
├── viewer.ts         # Visor HTML interactivo del grafo (d3)
└── rules/
    ├── dependency-direction.ts
    ├── direct-data-access.ts
    ├── forbidden-external.ts
    └── circular-deps.ts    # DFS con detección de back-edges
```

## Roadmap

- [x] Visor web interactivo del grafo (d3 force-directed, aristas rojas = violaciones) — `--html`
- [x] Path aliases del tsconfig (`@/*`) resueltos en el grafo — `--tsconfig`
- [x] `autopsia init` — generador de config detectando la estructura del proyecto
- [x] Suite de tests (Vitest) + CI en GitHub Actions
- [ ] Comparación histórica (`--compare reporte-anterior.json`)
- [ ] Reglas extra: god files, componentes con lógica de negocio, archivos huérfanos
- [ ] Publicación en npm (`npx autopsia-rn`) — paquete listo, pendiente `npm publish`

## Stack

Node · TypeScript · ts-morph (AST) · commander · chalk

## Licencia

MIT
