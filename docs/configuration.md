# Configuración

Todo vive en `autopsia.config.json`, en la raíz de tu proyecto. `npx autopsia-rn init` lo genera detectando tu estructura; esta página explica cada campo para cuando quieras ajustarlo.

Un config completo de referencia:

```json
{
  "layers": [
    {
      "name": "presentation",
      "patterns": ["src/presentation/*", "src/screens/*"],
      "allowedDependencies": ["domain"]
    },
    {
      "name": "domain",
      "patterns": ["src/domain/*"],
      "allowedDependencies": [],
      "forbiddenExternal": ["react", "react-native", "axios", "@supabase"]
    },
    {
      "name": "data",
      "patterns": ["src/data/*"],
      "allowedDependencies": ["domain", "infrastructure"]
    },
    {
      "name": "infrastructure",
      "patterns": ["src/infrastructure/*"],
      "allowedDependencies": ["domain"]
    }
  ],
  "dataAccessModules": ["axios", "@supabase/supabase-js", "@react-native-async-storage/async-storage"],
  "noDirectDataAccessIn": ["presentation"],
  "ignore": ["src/legacy"],
  "rules": {
    "dependency-direction": "error",
    "direct-data-access": "error",
    "forbidden-external": "error",
    "circular-deps": "error"
  }
}
```

## `layers`

La lista de capas de tu arquitectura. Cada capa:

| Campo | Qué hace |
|---|---|
| `name` | Nombre de la capa. Aparece en el reporte y se usa en `allowedDependencies` de otras capas. |
| `patterns` | Patrones de ruta que identifican los archivos de la capa. `*` matchea cualquier cosa (incluyendo subcarpetas): `"src/domain/*"` cubre `src/domain/entities/User.ts`. Sin `*`, el patrón matchea como substring. Case-insensitive. |
| `allowedDependencies` | De qué capas puede importar esta capa. `[]` = de ninguna. **Si se omite, la capa no tiene restricción** (útil mientras migras capa por capa). |
| `forbiddenExternal` | Paquetes npm prohibidos en esta capa. Matchea por prefijo de paquete: `"@supabase"` bloquea `@supabase/supabase-js`. |

Un archivo se clasifica con la **primera** capa cuyos patterns matcheen — si un archivo podría caer en dos, ordena la más específica primero. Los archivos que no matchean ninguna capa no se evalúan (el reporte dice cuántos quedaron sin capa).

### ¿Por qué esos `allowedDependencies` por defecto?

En Clean Architecture las dependencias apuntan **hacia adentro**: todas las capas pueden conocer al `domain`, y el `domain` no conoce a nadie. Por eso el default de `init` es:

- `presentation → domain` — la UI consume casos de uso.
- `data → domain, infrastructure` — los repositorios implementan contratos del domain apoyándose en clientes de infrastructure.
- `infrastructure → domain` — sí, también: un `UserRepositoryImpl` en infrastructure necesita importar la interfaz `UserRepository` y los `DomainErrors` que va a lanzar. Prohibirlo (versiones ≤ 0.2.0 generaban `[]`) marcaba como violación cada implementación de un contrato — puros falsos positivos.
- `domain → nada` — es el centro; si necesita algo de afuera, define una interfaz y que afuera la implementen.

Lo prohibido es la flecha inversa (`domain → data`, `domain → infrastructure`): el negocio no debe saber cómo se habla con la red o el storage.

### Estructuras no estándar

`patterns` acepta cualquier ruta, así que no necesitas carpetas llamadas "presentation". Ejemplos:

```json
{ "name": "presentation", "patterns": ["app/*", "src/components/*"] }
{ "name": "domain",       "patterns": ["src/core/*", "packages/business-logic/*"] }
```

Monorepo con paquetes por capa:

```json
{ "name": "domain", "patterns": ["packages/domain/*"] }
```

## `dataAccessModules`

Los paquetes npm que Autopsia considera "acceso directo a datos/red" para la regla [`direct-data-access`](rules.md#direct-data-access). Agrega los clientes que use tu proyecto:

```json
"dataAccessModules": ["axios", "ky", "@tanstack/react-query", "firebase", "@react-native-async-storage/async-storage"]
```

## `noDirectDataAccessIn`

En qué capas esos módulos son violación. Típicamente `["presentation"]`; agrega `"domain"` si no usas `forbiddenExternal` para eso.

## `ignore`

Carpetas a excluir del análisis (además de las que se ignoran siempre: `node_modules`, `dist`, `build`, `.git`, `coverage`, `__tests__`, `__mocks__`):

```json
"ignore": ["src/legacy", "e2e"]
```

## `rules`

Severidad por regla — la sección es opcional y su default es todo `"error"`:

| Nivel | Efecto |
|---|---|
| `"error"` | Se reporta en rojo y falla `scan --ci` (default) |
| `"warning"` | Se reporta en amarillo; `--ci` no falla |
| `"off"` | La regla no corre |

`"warning"` es el punto medio ideal al adoptar una regla nueva: la ves en cada scan sin romper el build de nadie.

## Baseline (`autopsia-baseline.json`)

No es parte del config: es un archivo aparte que genera `scan --update-baseline` con las violaciones toleradas ([guía](getting-started.md#adopting-autopsia-in-a-legacy-project)). Se busca en la raíz escaneada. Commitéalo. `--no-baseline` lo ignora para un scan puntual.

## Path aliases (`@/*`)

Si tu proyecto importa con aliases (`import { X } from '@/domain/...'`), Autopsia los resuelve usando el `tsconfig.json` de la raíz escaneada automáticamente. Si tu tsconfig con `paths` es otro:

```bash
npx autopsia-rn scan . --tsconfig ./tsconfig.app.json
```

## Flags de `scan` (referencia rápida)

| Flag | Qué hace |
|---|---|
| `-c, --config <file>` | Ruta al config (default: `autopsia.config.json` en la raíz escaneada) |
| `-o, --output <file>` | Guarda el reporte completo en JSON |
| `--html [file]` | Genera el visor interactivo (default: `autopsia-report.html`) |
| `--open` | Abre el visor al terminar (implica `--html`) |
| `--ci` | Exit code 1 si hay violaciones nuevas de severidad `error` |
| `--update-baseline` | Registra las violaciones actuales como toleradas |
| `--no-baseline` | Ignora el baseline en este scan |
| `--tsconfig <file>` | tsconfig a usar para resolver path aliases |
