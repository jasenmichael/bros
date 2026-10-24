---
title: App
description: Control plane tour of Dashboard, Chat, Providers, Sidecars, Status, Settings, and Docs.
---

# App

Bros UI is at `BROS_HOST`:`BROS_PORT` (default [http://127.0.0.1:3055](http://127.0.0.1:3055)). Login uses a shared passkey. After login, the dock (desktop) or hamburger (mobile) lists the surfaces.

## Surfaces

- **Dashboard** (`/`) — hub for recent chats, providers on for Chat, sidecar phase (Open on a running web UI), and the tunnel toggle. An attention row shows only when Docker, a sidecar, Ollama, disk, or chat readiness needs a fix. The page renders before `GET /api/dashboard/summary` finishes and shows **Loading…** until it returns. No widget catalog. No full Status table. **Bros services** stays on `/status`.
- **New chat** (`/chat`, `/chat/:id`) — optional provider and model, streaming replies, Voice to text mic (Whisper sidecar). One completion. See [Chat](/docs/chat).
- **Providers** (`/providers`) — Ollama, Popular services, Custom providers. Models are rows on a provider. There is no `/models` page. See [Providers](/docs/providers).
- **Sidecars** (`/sidecars`) — one list. Add sidecar and From a repo sit above one filter line: All / Running / Stopped, interface type, and Core / Addon / Custom, each in its own segmented control matching All / Running / Stopped. Addon and custom stay stopped until Autostart is on. Core always runs and has no Restart. Shipped OpenCode / Open WebUI / Firecrawl / Firecrawl UI / OpenJEV / Pi, plus packs under `lib/sidecars/custom` and git clones. Only `lib/sidecars/custom/README.md` is tracked. A custom pack can later move to addon or core. An addon can later move to core. Card headings: **(core)**, **(addon)**, **(custom)**, **(repo)**. Each card has a refresh icon next to running/stopped. A section with one card uses the wide layout. Two or more cards stay one wide card per row until the section container is at least 48rem, then compact in two columns. A narrow section stacks even when the viewport is wide. Open/Pin published webui at `http://127.0.0.1:<publish>/` on LAN (`http://127.0.0.1:4097/` for OpenCode). Via-tunnel, `proxy.public` pins use `/${id}/` on the Bros host — no shipped pack opts in today. Pin in nav only when a `webui` exists. Open is that published webpage. Published `api` and `openai` URLs copy and have no Open button. A `gui` card shows Open Name linking to `/desktop` and has no host-port Open. See [Sidecars](/docs/sidecars).
- **Terminal** (`/terminal`) — desktop sidecar terminal and Expose CLIs. Package apps are configured under Settings. See [Desktop sidecar](/docs/sidecars/desktop) and [Apps](/docs/apps).
- **Desktop** (`/desktop`) — one Selkies stream. The Drawer starts and stops GUI apps on that display. See [Desktop](/docs/sidecars/gui) and [Apps](/docs/apps).
- **Status** (`/status`) — detail health. See [Status](/docs/status).
- **Settings** (`/settings`) — personality and rules skills, Whisper and host Ollama toggles, MCP servers, read-only paths, Repair data dir, proxy key, and passkey. `/settings/desktop` adds and removes package apps. See [Settings](/docs/settings) and [Apps](/docs/apps).
- **Docs** (`/docs`) — this documentation (same markdown as the Pages site).

## Login

On first start Bros writes `{dataDir}/passkey` and prints `[bros] passkey: …` in the container logs. Setup/login stores a session cookie `bros_session`. Change the passkey in Settings.

## Dock

Desktop: left dock. Order is Dashboard, New chat (`/chat`), Providers, Sidecars, Terminal, GUI, Status, Previous chats, pinned sidecar UIs, then Docs + Settings, then a GitHub footer.

Previous chats: links go to `/chat/:id`. Recents overflow is Rename and Delete. Pinned sidecar UIs appear below a divider (no Pinned heading) only while that sidecar is running and not disabled (a stored pin stays; the dock ignores it while the sidecar is disabled or stopped).

**Docs** in the dock expands to the full docs directory tree (Start, App, Sidecars, Contribute, API). Every `docs/` page is a link, including Custom providers and each Popular service. Nested lists collapse; click a branch or chevron to close it even on the current page. The open branch follows the current page until closed. Dashboard…Status stay fully visible. Previous chats and the Docs tree each scroll with hidden scrollbars. Icon mode shows the Docs icon only.

## Recents and pins

Chat threads land under Previous chats after the first send. Sidecar web UIs with `navPinned` open as `http://127.0.0.1:<publish>/` on LAN, or same-host `/${id}/` via-tunnel when `proxy.public`.
