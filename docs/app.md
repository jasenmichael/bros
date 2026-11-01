---
title: App
description: Control plane tour of Dashboard, Chat, Providers, Docker apps, Status, Settings, and Docs.
---

# App

Bros UI is at `BROS_HOST`:`BROS_PORT` (default [http://127.0.0.1:3055](http://127.0.0.1:3055)). Login uses a shared passkey. After login, the dock (desktop) or hamburger (mobile) lists the surfaces.

## Surfaces

- **Dashboard** (`/`) — hub for recent chats, providers on for Chat, docker app phase (Open on a running web UI), and the tunnel toggle. An attention row shows only when Docker, a docker app, Ollama, disk, or chat readiness needs a fix. The page renders before `GET /api/dashboard/summary` finishes and shows **Loading…** until it returns. No widget catalog. No full Status table. **Bros services** stays on `/status`.
- **New chat** (`/chat`, `/chat/:id`) — optional provider and model, streaming replies, Voice to text mic (Whisper docker app). One completion. See [Chat](/docs/chat.md).
- **Providers** (`/settings/providers`) — Ollama, Popular services, Custom providers. Models are rows on a provider. There is no `/models` page. See [Providers](/docs/providers.md).
- **Desktop apps** (`/settings/desktop/apps`) — one list of Ollama, Whisper, and docker apps. Add and From a repo sit above one filter line: All / Running / Stopped, interface type, and Core / Addon / Custom. Docker apps stay stopped until Start. Ollama and Whisper have no Start, Stop, or Restart. Shipped docker apps are Open WebUI, Firecrawl, Firecrawl UI, OpenJEV, Pi, and OmniRoute. Custom apps are `data/config/apps` and are not in the repo. Moving that directory to `lib/apps/addon` or `lib/apps/core` ships it. Card headings: **(core)**, **(addon)**, **(custom)**, **(repo)**. See [Docker apps](/docs/apps.md).
- **Terminal** (`/terminal`) — shell in the Bros container and a compact comma-separated CLI list. Package apps are configured under Settings → Desktop apps. See [Desktop](/docs/desktop.md) and [Apps](/docs/apps.md).
- **Desktop** (`/desktop`) — one Selkies stream. The Drawer starts and stops GUI apps on that display. See [Desktop](/docs/desktop-gui.md) and [Apps](/docs/apps.md).
- **Status** (`/status`) — detail health. See [Status](/docs/status.md).
- **Settings** (`/settings`) — personality and rules skills, Whisper and host Ollama toggles, MCP servers, read-only paths, Repair data dir, proxy key, and passkey. `/settings/desktop/apps` adds and removes package apps. `/settings/desktop` sets the desktop background (color + image URL). See [Settings](/docs/settings.md) and [Apps](/docs/apps.md).
- **Docs** (`/docs`) — this documentation (same markdown as the Pages site).

## Login

On first start Bros writes `{dataDir}/passkey` and prints `[bros] passkey: …` in the container logs. Setup/login stores a session cookie `bros_session`. Change the passkey in Settings.

## Dock

Desktop: left dock. Order is Dashboard, Desktop, Terminal, Apps, Status, then New chat (`/chat`), Previous chats, Agents, Providers, then pinned docker app UIs, Docs + Settings, and a GitHub footer.

Previous chats: links go to `/chat/:id`. Recents overflow is Rename and Delete. Pinned web UIs appear below a divider (no Pinned heading) only while that app is running and not disabled. A package web UI with a service follows the same rule. A stored pin stays.

**Docs** in the dock expands to the full docs directory tree (Start, App, Docker apps, Contribute, API). Every `docs/` page is a link, including Custom providers and each Popular service. Nested lists collapse; click a branch or chevron to close it even on the current page. The open branch follows the current page until closed. Dashboard…Status stay fully visible. Previous chats and the Docs tree each scroll with hidden scrollbars. Icon mode shows the Docs icon only.

## Recents and pins

Chat threads land under Previous chats after the first send. Pinned web UIs open as `http://127.0.0.1:<publish>/` on LAN. A docker app with `proxy.public` uses same-host `/${id}/` via-tunnel. A package web UI uses `/${id}/` via-tunnel.
