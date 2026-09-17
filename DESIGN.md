# DESIGN — Bros

## Visual

- Dark surface with cool blue/teal accents (`--bros-accent`, `--bros-accent-2`)
- Shared shell via `BrosAppNav` / `BrosNavBar` / `BrosPageShell` in `layers/theme`
- Docs site landing vs app dashboard: same theme, different homepage
- Docs site local: `pnpm docs:dev` → http://127.0.0.1:3056/bros/ (`baseURL` `/bros/`)

## Navigation

- **Desktop (lg+):** left dock column in the app frame. Main content sits beside it (flex); the panel occupies layout width so content shrinks/grows. Resizable by dragging the right edge. Persist `open` / `width` / `iconMode` in localStorage. Drag below 80px snaps to icon-only (icons + hover titles); drag past 112px snaps labels back. One brand (dock when open; top bar brand + panel toggle only when dock closed).
- **Mobile:** hamburger overlay drawer. No dock column; overlay is OK.
- App order: Dashboard, New chat, Models, Sidecars, Status, divider, Previous chats (open list, collapsible), divider, pinned sidecar UIs, divider, Docs + Settings, footer GitHub: https://github.com/jasenmichael/bros
- `/chat` is a new empty conversation (composer only). `/chat/:id` opens a saved thread. Recents live in the dock, not a Chat left rail. Each recent has a ⋮ menu: Rename, Delete.
- Docs site: Home, Getting started, Sidecars, Configuration
- Sidecar web UIs with `navPinned` appear below a divider (no Pinned heading) as `http://127.0.0.1:<publish>/`

## Pages

- `/` — dashboard widgets (live snippets). No full Status table on Home
- `/status` — detail: Bros app, Docker, disk, GPU, host Tunnel, each sidecar mode/port/state/error, autostart/pin, logs links
- `/docs/*` — from docs layer content
- `/chat`, `/chat/:id`, `/models`, `/sidecars`, `/sidecars/:id/logs`, `/settings` — app-only
- Chat/Models: Host vs Sidecar Ollama picker when a host install is found (publish :11435 on the sidecar card; do not show containerPort)
- Chat assistant label: `ASSISTANT · <modelId>` from the stored request model, not the current dropdown. No model text when the row has none.
