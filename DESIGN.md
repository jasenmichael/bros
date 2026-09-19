# DESIGN — Bros

## Visual

- Dark surface with cool blue/teal accents (`--bros-accent`, `--bros-accent-2`)
- Thin themed scrollbars (≈6px, muted thumb, no arrows) via theme `main.css` for page content. Dock Previous chats and Docs tree scroll with hidden bars + recents chevron hints; Dashboard…Status never scroll
- Shared shell via theme `layouts/default.vue` (`BrosAppNav` / `BrosNavBar` / `BrosPageShell`); same chrome in app and website; only nav links differ
- Docs markdown uses theme `.bros-prose` + `ProsePre` (identical on website and in the app). Chat assistant and user bodies use the same stack (`MDC` + `.bros-prose` + `ProsePre`) so headings, lists, code, tables, and blockquotes match Docs inside the thread/bubbles.
- Docs site landing vs app dashboard: same theme, different homepage (`src/website` owns `/`; app `/` is the dashboard)
- Docs site local: `pnpm docs:dev` → http://127.0.0.1:3056/bros/ (`baseURL` `/bros/`)

## Navigation

- **Desktop (lg+):** left dock column in the app frame. Main content sits beside it (flex); the panel occupies layout width so content shrinks/grows. Resizable by dragging the right edge. Persist `open` / `width` / `iconMode` in localStorage. Drag below 80px snaps to icon-only (icons + hover titles); drag past 112px snaps labels back. One brand (dock when open; top bar brand + panel toggle only when dock closed).
- **Mobile:** hamburger overlay drawer. No dock column; overlay is OK.
- App order: Dashboard, New chat, Models, Sidecars, Status (fixed height, no scroll), divider, Previous chats (open list, collapsible; divider + heading stay fixed; list scrolls with hidden scrollbar; up chevron under the heading and down chevron under the list when more recents sit off-screen), divider, pinned sidecar UIs, divider, Docs (collapsible directory tree of every `/docs` page, own hidden scrollbar) + Settings, footer GitHub: https://github.com/jasenmichael/bros
- `/chat` is a new empty conversation: full-height column, centered greeting + rounded composer. Provider then model sit left in a compact tools row above the composer, context size on the right — not a fat header card or empty message well. `/chat/:id` (and the first send on `/chat`) fills the column with turns; composer docks to the bottom; only the message thread scrolls (not the app frame). Recents live in the dock, not a Chat left rail. Each recent has a ⋮ menu: Rename, Delete. While waiting: centered muted **thinking…**; send becomes a square **Stop** (no spinner). Assistant meta is role+model left, `1.4s · 128 tok` right when stored.
- Docs site: Home, then the same collapsible docs tree (Start, App, Sidecars, Popular services, Contribute)
- Docs pages: breadcrumbs above the title, walked from that tree
- Sidecar web UIs with `navPinned` appear below a divider (no Pinned heading) as `http://127.0.0.1:<publish>/`

## Pages

- `/` — website: marketing landing. App: dashboard widgets (live snippets). No full Status table on Home
- `/status` — detail: Bros app, Docker, disk, GPU, host Tunnel, each sidecar mode/port/state/error, autostart/pin, logs links
- `/docs`, `/docs/*` — identical docs-layer pages in website and app (theme layout + prose)
- `/chat`, `/chat/:id`, `/models`, `/sidecars`, `/sidecars/:id/logs`, `/settings` — app-only
- Chat/Models: Models is Ollama (sidecar then host), Popular services (12 always-listed OpenAI-compat cards), then Custom providers. Rows show host:port (`127.0.0.1:11435` sidecar publish, not Docker DNS) or the API host for popular/custom, with copy + open-in-new-tab. Both Ollama cards load collapsed; selecting a card expands pull + installed models on that card; the chevron (or a second click on the open card) collapses the panel for the rest of the session. Ollama, Popular, and Custom lists stay full BrosPageShell width whether a card is open or collapsed. Each row has a Chat switch (default on) plus a settings cog (UModal); GPU only in the sidecar modal. Popular cog is key + models (no Delete). Host card stays listed when the daemon is down. Unconfigured popular cards stay listed. Chat is provider dropdown then model dropdown (order: sidecar, host, popular, custom; disabled providers omitted). Heading is Popular services, never “Paid providers”.
- Chat turns: user is a right-aligned bubble (cool accent wash, not a stacked gray card). Assistant is left. Both bodies render through theme `.bros-prose` + `ProsePre` (same as Docs), not a second Tailwind `prose` stack. Label `ASSISTANT · <modelId>` is a small muted line next to the assistant, from the stored request model, not the current dropdown. No model text when the row has none. Fenced code uses a snippet header with a copy control (check after copy).
