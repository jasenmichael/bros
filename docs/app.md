---
title: App
description: Control plane tour of Dashboard, Chat, Providers, Sidecars, Status, Settings, and Docs.
---

# App

Bros UI on host port **3055**. Login uses a shared passkey. After login, the dock (desktop) or hamburger (mobile) lists the surfaces.

## Surfaces

- **Dashboard** (`/`) — live widgets for the app, Docker, disk, GPU, **Ollama** (sidecar + host providers; Details → `/providers`), and tunnel. No Sidecars summary card. **Bros services** lists every Bros-managed Docker container (app `bros` plus each `bros-sc-*` service, including Firecrawl’s stack). Sidecar rows sit in a later **Sidecar snippets** section (Status / Logs). Each snippet shows that sidecar’s publish port only — not host Ollama. Host Ollama is not a sidecar. No full Status table.
- **Chat** (`/chat`, `/chat/:id`) — provider then model, streaming replies. See [Chat](/docs/chat).
- **Providers** (`/providers`) — Ollama, Popular services, Custom providers. See [Providers](/docs/providers).
- **Sidecars** (`/sidecars`) — Core (Ollama), then Addon sidecars (shipped OpenCode / Open WebUI / Firecrawl / Firecrawl UI plus data-dir and git packs). Card source badges: **bros**, **repo**, **custom**. Each card has a refresh icon next to running/stopped. A section with one card uses the wide layout (Core always). Two or more cards go two-up compact on large screens; mobile stays one wide card per row. Open/Pin published webui at `http://127.0.0.1:<publish>/` (Pin in nav only when a `webui` exists). Published APIs get Open, not Pin. See [Sidecars](/docs/sidecars).
- **Status** (`/status`) — detail health. See [Status](/docs/status).
- **Settings** (`/settings`) — Chat prepend + assistant description, read-only paths, and passkey. See [Settings](/docs/settings).
- **Docs** (`/docs`) — this documentation (same markdown as the Pages site).

## Login

On first start Bros writes `{dataDir}/passkey` and prints `[bros] passkey: …` in the container logs. Setup/login stores a session cookie `bros_session`. Change the passkey in Settings.

## Dock

Desktop: left dock. Order is Dashboard, New chat, Providers, Sidecars, Status, Previous chats, pinned sidecar UIs, then Docs + Settings, then a GitHub footer.

Previous chats: open, collapsible list. Recents overflow is Rename and Delete. Pinned sidecar UIs appear below a divider (no Pinned heading).

**Docs** in the dock expands to the full docs directory tree (Start, App, Sidecars, Contribute, API). Every `docs/` page is a link, including Custom providers and each Popular service. Nested lists collapse; click a branch or chevron to close it even on the current page. The open branch follows the current page until closed. Dashboard…Status stay fully visible. Previous chats and the Docs tree each scroll with hidden scrollbars. Icon mode shows the Docs icon only.

## Recents and pins

Chat threads land under Previous chats after the first send. Sidecar web UIs with `navPinned` open as `http://127.0.0.1:<publish>/`.
