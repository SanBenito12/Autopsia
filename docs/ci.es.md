[English](ci.md) · Español

# Autopsia en CI (GitHub Actions)

La idea: cada PR corre `autopsia scan --ci`. Si alguien introduce una violación **nueva** de arquitectura, el build falla con el reporte completo en los logs. Las violaciones ya toleradas en el baseline no molestan.

## Receta mínima

`.github/workflows/architecture.yml`:

```yaml
name: Arquitectura

on:
  pull_request:
  push:
    branches: [main]

jobs:
  autopsia:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Auditar arquitectura
        run: npx autopsia-rn --lang es scan . --ci
```

Eso es todo. Requisitos: `autopsia.config.json` commiteado (lo genera `npx autopsia-rn --lang es init`) y, si tu proyecto es legacy, `autopsia-baseline.json` también commiteado.

## Flujo con baseline (proyectos con deuda)

1. **Una sola vez, en local:**

   ```bash
   npx autopsia-rn --lang es init
   npx autopsia-rn --lang es scan . --update-baseline
   git add autopsia.config.json autopsia-baseline.json
   git commit -m "chore: adoptar autopsia con baseline"
   ```

2. **En CI** corre el workflow de arriba tal cual. `scan` encuentra el baseline en la raíz y:
   - violaciones viejas → toleradas, exit 0 ✅
   - violación nueva en el PR → reporte en rojo, exit 1 ❌

3. **Cuando pagues deuda**, regenera el baseline en el mismo PR que arregla las violaciones:

   ```bash
   npx autopsia-rn --lang es scan . --update-baseline
   git add autopsia-baseline.json
   ```

   Así lo arreglado ya no puede regresar. El baseline solo debería **encoger** con el tiempo — si un PR lo hace crecer, eso es una decisión de arquitectura que el review debería discutir.

## Extras útiles

**Subir el visor HTML como artifact del build:**

```yaml
      - name: Auditar arquitectura
        run: npx autopsia-rn --lang es scan . --ci --html autopsia-report.html

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: autopsia-report
          path: autopsia-report.html
```

(`if: always()` sube el reporte también cuando el scan falla — que es justo cuando más lo quieres ver.)

**Fijar la versión** para builds reproducibles:

```yaml
        run: npx autopsia-rn@0.5.0 scan . --ci
```

**Proyecto con path aliases** y tsconfig no estándar:

```yaml
        run: npx autopsia-rn --lang es scan . --ci --tsconfig ./tsconfig.app.json
```

## Códigos de salida y comparación (v0.4)

- `0`: scan permitido; sin errores nuevos en CI y, si `strict` está activo, análisis completo.
- `1`: `--ci` detecta errores nuevos o análisis incompleto con `strict: true`. Esto incluye scans vacíos e imports calculados no analizables. Los warnings solos no fallan CI.
- `2`: configuración inválida, rutas requeridas ausentes o reporte de comparación inválido.

`--compare anterior.json` muestra deuda nueva/resuelta/persistente sin sustituir el baseline ni cambiar estos códigos. El reporte anterior se lee antes de escribir la salida, por lo que puedes usar la misma ruta para entrada y salida. La comparación incluye deuda tolerada y excluye violaciones suprimidas. Conserva la misma configuración para comparar refactorizaciones.

## Verificación del paquete para mantenedores

Con Node 22/24: `npm ci`, `npm run build`, `npm test` y `npm run test:package`. La última orden empaqueta e instala en un directorio temporal, ejecuta la CLI instalada y comprueba el HTML sin scripts externos. Puede necesitar red para resolver dependencias. El workflow repite la verificación en Linux, Windows y macOS y comprueba la CLI compilada con Node 18.

## Idioma y alcance (0.5)

La salida predeterminada está en inglés. Usa `--lang es` antes o después de `scan` o `init` para mostrar español, incluido el HTML. El JSON y baseline v1 mantienen sus mensajes canónicos en español para conservar compatibilidad; los metadatos `diagnostic` son opcionales. Los reportes antiguos sin ellos muestran su texto original.

Autopsia comprueba dependencias contra reglas configuradas. No certifica toda la arquitectura ni detecta llamadas globales a `fetch()`. Los imports exclusivamente de tipos se excluyen de las reglas.
