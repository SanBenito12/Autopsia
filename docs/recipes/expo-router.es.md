# Guía de Arquitectura para Expo Router con Autopsia

[English](expo-router.md) · Español

Expo Router organiza las pantallas mediante enrutamiento basado en archivos (carpeta `app/`). Mantener las rutas, los componentes de interfaz y los servicios de red/datos desacoplados previene que la aplicación se vuelva frágil y difícil de mantener.

---

## 1. Configuración Rápida (Cero Fricción)

Ejecuta en la raíz de tu proyecto Expo:

```bash
npx autopsia-rn init
```

Autopsia detecta automáticamente la carpeta `app/` y crea una configuración adaptada para Expo Router:

```json
{
  "layers": [
    {
      "name": "routes",
      "patterns": ["app/*"],
      "allowedDependencies": ["features", "components", "services", "hooks", "constants"]
    },
    {
      "name": "components",
      "patterns": ["components/*"],
      "allowedDependencies": ["hooks", "constants"]
    },
    {
      "name": "services",
      "patterns": ["services/*", "api/*"],
      "allowedDependencies": ["constants"]
    }
  ],
  "noDirectDataAccessIn": ["routes", "components"]
}
```

---

## 2. Inspeccionar el Grafo Visual en el Navegador

Para ver el grafo interactivo de dependencias y la salud de tus capas:

```bash
npx autopsia-rn view
```

Autopsia analiza tu proyecto, genera el archivo `autopsia-report.html` y abre tu navegador predeterminado automáticamente.

---

## 3. Feedback en Vivo Durante el Desarrollo

Deja corriendo el observador mientras escribes código:

```bash
npx autopsia-rn scan --watch
```

Cada vez que guardes un archivo `.tsx` o `.ts`, Autopsia reanaliza las dependencias en milisegundos y te alerta inmediatamente si rompiste alguna regla de arquitectura.

---

## 4. Proteger Pull Requests en GitHub Actions

Genera un flujo de CI completo en un solo paso:

```bash
npx autopsia-rn setup-ci
```

Esto crea el archivo `.github/workflows/autopsia.yml`. En cada Pull Request, los errores de arquitectura aparecerán anotados directamente sobre la línea de código modificada.
