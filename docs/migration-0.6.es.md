# Migración a 0.6

[English](migration-0.6.md) · Español

**Preparación local: 0.6.0 todavía no está publicada.** La versión actual en npm sigue siendo 0.5.0. No ejecutes los ejemplos npm fijados a 0.6 hasta que esté disponible.

## Probar el paquete local

Desde el repositorio de Autopsia, compila y empaqueta en una carpeta existente fuera de tu aplicación:

```bash
npm run build
npm pack --ignore-scripts --pack-destination /ruta/absoluta/salida
```

Ejecuta el paquete contra una copia aislada de la aplicación, sustituyendo las rutas:

```bash
npm exec --yes --package=/ruta/absoluta/salida/autopsia-rn-0.6.0.tgz -- autopsia --version
npm exec --yes --package=/ruta/absoluta/salida/autopsia-rn-0.6.0.tgz -- autopsia init /ruta/absoluta/app --preset react-native --dry-run
npm exec --yes --package=/ruta/absoluta/salida/autopsia-rn-0.6.0.tgz -- autopsia doctor /ruta/absoluta/app
```

`--dry-run` y `doctor` no escriben configuración ni baseline. `doctor --output` escribe explícitamente el reporte solicitado. Revisa la propuesta antes de ejecutar `init` sin `--dry-run`. Los archivos existentes están protegidos salvo que uses `--force`.

## Configuración y deuda existentes

Conserva tu configuración y baseline v1. No necesitan conversión ni regeneración. Las entradas `files` son rutas relativas exactas opcionales; los patrones existentes conservan su comportamiento. El preset React Native es optativo y no modifica configuraciones existentes.

Los imports cuyos símbolos resueltos son exclusivamente tipos ahora pierden sus aristas de ejecución incluso sin `import type`. Algunos hallazgos antiguos pueden aparecer como resueltos. Los que persisten mantienen su identidad canónica; las ocurrencias adicionales siguen siendo nuevas. `message`/`detail` canónicos en español y los metadatos opcionales siguen siendo independientes del idioma de presentación. Los reportes antiguos sin metadatos siguen mostrándose y comparándose.

Compara reportes hechos con la **misma configuración** para aislar cambios del detector. Si también adoptas el preset, haz otra comparación: cambios de política o cobertura no son regresiones del detector. Revisa una muestra de hallazgos con el equipo antes de tolerarlos.

## Comprobaciones de preparación más estrictas

Los tsconfig base ausentes o inválidos ahora generan incidencias de análisis. `scan --ci` estricto falla si la configuración no pudo cargarse completamente, incluso con deuda registrada. `doctor` explica el fallo y propone el siguiente paso; no instala dependencias ni edita rutas. Los errores generales de tipos de la aplicación siguen siendo responsabilidad de TypeScript.

Códigos de salida de doctor: 0 preparado, 1 preparación/cobertura incompleta, 2 argumentos o configuración malformada o fallo de ejecución. Estar preparado no significa aprobar las reglas de dependencias: ejecuta también `scan --ci`.

## Límites restantes

El escáner incorpora TS/TSX, no descubre entradas JS/JSX. Imports mixtos, símbolos con valor, namespaces, reexportaciones `export *`, imports de efectos secundarios y símbolos inciertos conservan aristas. No se reproduce todo el proceso de transformación de Metro. Se comprueban imports de módulos configurados; no llamadas globales a `fetch()`. Clasificar todos los archivos no certifica la calidad arquitectónica.

Doctor también muestra la versión del motor TypeScript incluido en Autopsia. Un proyecto con opciones o bibliotecas más recientes puede necesitar un analizador más nuevo aunque su propio compilador acepte la configuración. No lo interpretes como un defecto del código de la aplicación.
