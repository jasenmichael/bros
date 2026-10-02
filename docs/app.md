---
title: App
description: Control plane tour of Dashboard, Chat, Providers, Sidecars, Status, Settings, and Docs.
---

# App

Bros UI on host port **3055**. Login uses a shared passkey. After login, the dock (desktop) or hamburger (mobile) lists the surfaces.

## Surfaces

- **Dashboard** (`/`) — hub for recent chats, providers on for Chat, sidecar phase (Open on a running web UI), and the tunnel toggle. An attention row shows only when Docker, a sidecar, Ollama, disk, or chat readiness needs a fix. The page renders before `GET /api/dashboard/summary` finishes and shows **Loading…** until it returns. No widget catalog. No full Status table. **Bros services** stays on `/status`.
- **New chat** (`/chat`, `/chat/:id`) — optional provider and model, streaming replies, Voice to text mic (Whisper sidecar). One completion. See [Chat](/docs/chat).
- **Providers** (`/providers`) — Ollama, Popular services, Custom providers. Models are rows on a provider. There is no `/models` page. See [Providers](/docs/providers).
- **Sidecars** (`/sidecars`) — Core (Ollama and Whisper), then Addon sidecars (shipped OpenCode / Open WebUI / Firecrawl / Firecrawl UI / OpenJEV plus data-dir and git packs). Card headings: **(core)**, **(addon)**, **(custom)**, **(repo)**. Each card has a refresh icon next to running/stopped. A section with one card uses the wide layout. Two or more cards stay one wide card per row until the section container is at least 48rem, then compact in two columns. A narrow section stacks even when the viewport is wide. Open/Pin published webui at `http://127.0.0.1:<publish>/` on LAN (`http://127.0.0.1:4097/` for OpenCode). Via-tunnel, `proxy.public` pins use `/${id}/` on the Bros host — no shipped pack opts in today. Pin in nav only when a `webui` exists. Open is that published webpage. Published `api` and `openai` URLs copy and have no Open button. See [Sidecars](/docs/sidecars).
- **Status** (`/status`) — detail health. See [Status](/docs/status).
- **Settings** (`/settings`) — personality and rules skills, Whisper and host Ollama toggles, MCP servers, read-only paths, proxy key, and passkey. See [Settings](/docs/settings).
- **Docs** (`/docs`) — this documentation (same markdown as the Pages site).

## Login

On first start Bros writes `{dataDir}/passkey` and prints `[bros] passkey: …` in the container logs. Setup/login stores a session cookie `bros_session`. Change the passkey in Settings.

## Dock

Desktop: left dock. Order is Dashboard, New chat (`/chat`), Providers, Sidecars, Status, Previous chats, pinned sidecar UIs, then Docs + Settings, then a GitHub footer.

Previous chats: links go to `/chat/:id`. Recents overflow is Rename and Delete. Pinned sidecar UIs appear below a divider (no Pinned heading).

**Docs** in the dock expands to the full docs directory tree (Start, App, Sidecars, Contribute, API). Every `docs/` page is a link, including Custom providers and each Popular service. Nested lists collapse; click a branch or chevron to close it even on the current page. The open branch follows the current page until closed. Dashboard…Status stay fully visible. Previous chats and the Docs tree each scroll with hidden scrollbars. Icon mode shows the Docs icon only.

## Recents and pins

Chat threads land under Previous chats after the first send. Sidecar web UIs with `navPinned` open as `http://127.0.0.1:<publish>/` on LAN, or same-host `/${id}/` via-tunnel when `proxy.public`.
