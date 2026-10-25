---
name: stack
description: Tech stack — Bun.serve HTML import, vanilla TypeScript, dependency-free SVG charts, localStorage, first-visit onboarding wizard.
keywords: [bun, frontend, charts, storage, localstorage]
updated: 2026-10-25
---

### Rule / Fact

- `index.ts` serves `src/index.html` via Bun HTML imports (Bun bundles `app.ts` and CSS). Scripts: `bun run dev`, `bun run build`, `bun test`.
- No runtime dependencies: charts are hand-built SVG in `src/charts.ts` (line chart with crosshair tooltip, grouped bars).
- All user data (settings, readings, theme) lives in `localStorage` key `odo:v1`; there is no backend storage.
- First visit (no `settings.leaseStart` in storage) shows the onboarding wizard (`src/onboarding.ts` + `onboarding.css`); an inline script in `index.html` adds `needs-onboarding` to `<html>` before paint so the dashboard never flashes. "Ištrinti visus duomenis" restarts onboarding.
- Chart colors follow the dataviz skill palette: actual = blue `--series-actual`, plan/allowance = gray `--muted`.

### Context & Why

The developer wanted settings remembered in their browser and a modern design with charts; zero deps keeps the static build tiny.

### Practical Impact

For screenshot checks, headless `/usr/bin/chromium` is installed in the devcontainer. Keep tooling like puppeteer-core outside the project (scratchpad), not in package.json.
