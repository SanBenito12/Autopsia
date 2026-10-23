# Autopsia Desktop (macOS)

Native-feeling desktop app for Autopsia. It runs the same engine as the CLI (`../src`) in a background process, so results match `npx autopsia-rn scan`.

This folder is **not** part of the `autopsia-rn` npm package (the root `package.json` only publishes `dist/` and the READMEs).

## Develop

```bash
cd desktop
npm install
npm run dev            # electron-vite with hot reload
npx electron . ../fixtures/sample-app   # after `npm run build`, open a folder directly
```

## Package

```bash
npm run dist:mac       # release/Autopsia-<version>-arm64.dmg and release/Autopsia-<version>.dmg (x64)
```

Builds are unsigned for now: on first launch, right-click the app → Open.

## Layout

- `src/main` — window, native menu, IPC, recent projects, file watcher
- `src/main/engine.ts` — utility process that runs scan / doctor / init / baseline via `../src/api.ts`
- `src/preload` — typed `window.autopsia` bridge
- `src/renderer` — React UI (findings, dependency graph, doctor, configuration, guided tour with driver.js)
