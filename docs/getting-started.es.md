# Primeros pasos

[English](getting-started.md) · Español

> Guía de la 0.6.0 local, aún sin publicar. [Instalación local y migración](migration-0.6.es.md).

Evita nuevas violaciones sin arreglar toda la deuda heredada primero. Requiere Node 18 o superior. Ejecuta los comandos desde la raíz del proyecto.

<a id="what-is-clean-architecture"></a>
## ¿Qué es Clean Architecture?

Organiza el código en capas con direcciones de dependencia explícitas. Una configuración habitual es:

```text
presentation → domain ← data
                  ↑       ↓
             infrastructure
```

La interfaz usa contratos y casos de uso del dominio. Datos e infraestructura implementan esos contratos. El dominio no importa React ni clientes de red. Son límites configurables, no una evaluación de todos los aspectos del diseño del software.

## 1. Previsualiza y revisa la configuración

```bash
npx autopsia-rn@0.6.0 init --preset react-native --dry-run --lang es
# Revisa la propuesta y después guárdala:
npx autopsia-rn@0.6.0 init --preset react-native --lang es
```

Autopsia reconoce nombres comunes bajo `src/` y `src/features/<feature>/`. El preset optativo añade application/composición y subcarpetas inequívocas de shared. Las carpetas ambiguas quedan pendientes. Omite `--preset` para conservar el detector anterior. Sin una estructura reconocible, genera un ejemplo que debes adaptar.

Revisa `patterns`, `files`, `allowedDependencies` y `dataAccessModules`. Conserva tu configuración existente salvo que quieras reemplazarla deliberadamente con `--force`. La previsualización nunca escribe, incluso con `--force`.

## 2. Comprueba la preparación

```bash
npx autopsia-rn@0.6.0 doctor . --lang es --output doctor.json
```

Doctor explica archivos sin clasificar, coincidencias ambiguas, imports internos sin resolver y fallos de carga de tsconfig. No modifica el proyecto ni evalúa las reglas de dependencias: para eso ejecuta scan. El JSON contiene todas las incidencias; la consola muestra hasta diez.

Una cobertura baja indica trabajo pendiente en la configuración. El baseline no perdona archivos sin capa, patrones ambiguos, dependencias internas sin resolver ni imports calculados en CI estricto. Consulta [configuración](configuration.es.md).

## 3. Analiza las dependencias

```bash
npx autopsia-rn@0.6.0 scan . --lang es
npx autopsia-rn@0.6.0 scan . --lang es --html --open
```

La consola muestra cobertura, hallazgos con línea de origen y archivos con más violaciones. El HTML independiente colorea archivos por capa y resalta dependencias internas infractoras en rojo. [Explora el reporte de ejemplo](https://sanbenito12.github.io/Autopsia/report.es.html).

Para reproducir el fixture público de ocho archivos desde este repositorio, ejecuta `npm ci` y `npm run scan:fixture`: contiene cinco violaciones intencionales. El [ejemplo antes/después](before-after.md) elimina una y compara los resultados.

La salud por capa es el porcentaje de archivos clasificados sin violaciones, incluida la deuda tolerada. Las capas vacías muestran `N/A`. No es una puntuación general de calidad.

<a id="adopting-autopsia-in-a-legacy-project"></a>
## Adoptar Autopsia con deuda heredada

Después de revisar configuración, cobertura y hallazgos, registra la deuda actual una vez:

```bash
npx autopsia-rn@0.6.0 scan . --update-baseline --lang es
npx autopsia-rn@0.6.0 scan . --ci --lang es
```

Versiona `autopsia.config.json` y `autopsia-baseline.json`. CI falla por errores nuevos o análisis incompleto cuando `strict: true`. La deuda tolerada permanece visible y no falla por sí sola.

Después de corregir deuda, revisa y regenera el baseline en el mismo cambio. No lo regeneres automáticamente en CI: aceptarías deuda nueva. Las ocurrencias adicionales cuentan como nuevas; mover líneas de código no.

Usa `--no-baseline` para inspeccionar toda la deuda. Los baselines siguen en versión 1 y mantienen sus campos canónicos en español.

## Idiomas y límites

Inglés es el idioma por defecto; `--lang en|es` funciona antes o después del subcomando y cambia consola y HTML. El JSON mantiene texto canónico español y metadatos opcionales de diagnóstico. Los reportes antiguos sin metadatos conservan su texto original.

Autopsia analiza reglas de dependencias configuradas para archivos TS/TSX incluidos. Excluye imports explícitos de tipos y símbolos resueltos exclusivamente como tipos; conserva imports mixtos y casos inciertos. No reproduce todas las transformaciones de Metro. El acceso a datos se detecta mediante imports de módulos configurados, no mediante llamadas globales a `fetch()`. ESLint y TypeScript siguen siendo útiles junto a Autopsia.

- [Reglas y correcciones](rules.es.md)
- [Configuración y opciones](configuration.es.md)
- [CI y baseline](ci.es.md)
- [Migración 0.5 → 0.6](migration-0.6.es.md)
