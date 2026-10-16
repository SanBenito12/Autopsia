# Expo Router Architecture Guide with Autopsia

English · [Español](expo-router.es.md)

Expo Router introduces file-based routing (`app/` directory). Keeping routing, UI components, and API/services clean prevents tightly coupled code that becomes difficult to maintain or test.

---

## 1. Quick Setup (Zero Configuration)

Run in your Expo project root:

```bash
npx autopsia-rn init
```

Autopsia automatically detects the `app/` folder and configures your project with sensible Expo defaults:

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

## 2. Inspecting Your App in the Visual Graph

To explore your project's dependency graph directly in your browser:

```bash
npx autopsia-rn view
```

Autopsia scans your code, generates `autopsia-report.html`, and opens it in your default browser. Click on nodes to inspect imports and violations.

---

## 3. Real-time Feedback During Development

Run the watcher while coding in VS Code or Cursor:

```bash
npx autopsia-rn scan --watch
```

Every time you save a `.ts` or `.tsx` file, Autopsia evaluates affected dependencies in milliseconds and reports any architecture violations.

---

## 4. Protecting Pull Requests with GitHub Actions

Generate a turnkey GitHub Actions workflow in one command:

```bash
npx autopsia-rn setup-ci
```

This creates `.github/workflows/autopsia.yml`. In your Pull Requests, architecture violations will be automatically highlighted on the exact code lines.
