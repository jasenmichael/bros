# DESIGN — Bros

## Visual

- Dark surface with cool blue/teal accents (`--bros-accent`, `--bros-accent-2`)
- Shared shell via `BrosAppNav` / `BrosNavBar` / `BrosPageShell` in `layers/theme`
- Docs site landing vs app dashboard: same theme, different homepage
- Docs site local: `pnpm docs:dev` → http://127.0.0.1:3056/bros/ (`baseURL` `/bros/`)

## Navigation

- **Desktop (lg+):** left dock column in the app frame. Main content sits beside it (flex); the panel occupies layout width so content shrinks/grows. Resizable by dragging the right edge. Persist `open` / `width` / `iconMode` in localStorage. Drag below 80px snaps to icon-only (icons + hover titles); drag past 112px snaps labels back. One brand (dock when open; top bar brand + panel toggle only when dock closed).
- **Mobile:** hamburger overlay drawer. No dock column; overlay is OK.
- App order: Dashboard, Chat, Models, Sidecars, Status, divider, pinned sidecar UIs, divider, then Docs + Settings at the bottom. Footer GitHub: https://github.com/jasenmichael/bros
- Docs site: Home, Getting started, Sidecars, Configuration
- Sidecar web UIs with `navPinned` appear below a divider (no Pinned heading) as `http://127.0.0.1:<hostPort>/`

## Pages

- `/` — dashboard widgets (live snippets). No full Status table on Home
- `/status` — detail: Bros app, Docker, disk, GPU, host Tunnel, each sidecar mode/port/state/error, autostart/pin, logs links
- `/docs/*` — from docs layer content
- `/chat`, `/models`, `/sidecars`, `/sidecars/:id/logs`, `/settings` — app-only
