# DESIGN — Bros

## Visual

- Dark surface with cool blue/teal accents (`--bros-accent`, `--bros-accent-2`)
- Shared shell via `BrosAppNav` / `BrosPageShell` in `layers/theme`
- Docs site landing vs app dashboard: same theme, different homepage
- Docs site local: `pnpm docs:dev` → http://127.0.0.1:3056/bros/ (`baseURL` `/bros/`)

## Navigation

- Docked left **nav panel** (opaque `#121820`), open/close via panel button; pushes main content
- Solid top bar in the main column for toggle when panel closed
- Docs panel: Home, Getting started, Sidecars, Configuration
- App panel: Dashboard, Chat, Models, Sidecars, Settings, Docs
- Sidecar web UIs with `navPinned` appear under **Pinned** (host port or `/<slug>/`)

## Pages

- `/` — dashboard in app (overrides docs landing)
- `/docs/*` — from docs layer content
- `/chat`, `/models`, `/sidecars`, `/settings` — app-only
- `/<slug>/` — proxied sidecar web UIs
