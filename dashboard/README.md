# Sentinel Dashboard

A static observability dashboard for Sentinel, deployed via GitHub Pages.

## Local development

```bash
cd dashboard
npm install
npm run dev
```

Opens at `http://localhost:5173`. The dev server hot-reloads all React and Tailwind changes.

## How it works

The dashboard is compiled at **build time** — all trace files under `../traces/*.json` are loaded via Vite's `import.meta.glob`, validated against Zod schemas, and bundled into the static site.

There is no backend, no runtime API calls, and no database.

### Adding a new trace

1. Run Sentinel on a PR — it writes a JSON file to `traces/<runId>.json`.
2. Commit and push the trace file to `main`.
3. The `dashboard.yml` workflow triggers, rebuilds the dashboard with the new trace, and deploys to GitHub Pages.

The dashboard reads traces from `../traces/` relative to `dashboard/src/data/loader.ts`. If you change this directory, update the glob pattern in `loader.ts`.

### Adding a page

1. Create a new component in `src/pages/`.
2. Add a route in `src/App.tsx`.
3. Optionally add a navigation link in `src/components/Layout.tsx`.

All data comes from `src/data/loader.ts` (cached singleton) and `src/data/derive.ts` (aggregation helpers).
