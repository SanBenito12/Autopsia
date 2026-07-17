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
          node-version: 20

      - name: Auditar arquitectura
        run: npx autopsia-rn scan . --ci
```

Eso es todo. Requisitos: `autopsia.config.json` commiteado (lo genera `npx autopsia-rn init`) y, si tu proyecto es legacy, `autopsia-baseline.json` también commiteado.

## Flujo con baseline (proyectos con deuda)

1. **Una sola vez, en local:**

   ```bash
   npx autopsia-rn init
   npx autopsia-rn scan . --update-baseline
   git add autopsia.config.json autopsia-baseline.json
   git commit -m "chore: adoptar autopsia con baseline"
   ```

2. **En CI** corre el workflow de arriba tal cual. `scan` encuentra el baseline en la raíz y:
   - violaciones viejas → toleradas, exit 0 ✅
   - violación nueva en el PR → reporte en rojo, exit 1 ❌

3. **Cuando pagues deuda**, regenera el baseline en el mismo PR que arregla las violaciones:

   ```bash
   npx autopsia-rn scan . --update-baseline
   git add autopsia-baseline.json
   ```

   Así lo arreglado ya no puede regresar. El baseline solo debería **encoger** con el tiempo — si un PR lo hace crecer, eso es una decisión de arquitectura que el review debería discutir.

## Extras útiles

**Subir el visor HTML como artifact del build:**

```yaml
      - name: Auditar arquitectura
        run: npx autopsia-rn scan . --ci --html autopsia-report.html

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: autopsia-report
          path: autopsia-report.html
```

(`if: always()` sube el reporte también cuando el scan falla — que es justo cuando más lo quieres ver.)

**Fijar la versión** para builds reproducibles:

```yaml
        run: npx autopsia-rn@0.2.0 scan . --ci
```

**Proyecto con path aliases** y tsconfig no estándar:

```yaml
        run: npx autopsia-rn scan . --ci --tsconfig ./tsconfig.app.json
```
