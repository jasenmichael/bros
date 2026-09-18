---
title: App
description: Control plane tour of Dashboard, Chat, Models, Sidecars, Status, Settings, and Docs.
---

# App

Bros UI on host port **3055**. Login uses a shared passkey. After login, the dock (desktop) or hamburger (mobile) lists the surfaces.

## Surfaces

- **Dashboard** (`/`) — live widgets for the app, Docker, disk, GPU, tunnel, and sidecar snippets. No full Status table.
- **Chat** (`/chat`, `/chat/:id`) — provider then model, streaming replies. See [Chat](/docs/chat).
- **Models** (`/models`) — Ollama, Popular services, Custom providers. See [Models](/docs/models).
- **Sidecars** (`/sidecars`) — core and custom Compose projects. Open/Pin web UIs at `http://127.0.0.1:<publish>/`. See [Sidecars](/docs/sidecars).
- **Status** (`/status`) — detail health. See [Status](/docs/status).
- **Settings** (`/settings`) — read-only paths and passkey. See [Settings](/docs/settings).
- **Docs** (`/docs`) — this documentation (same markdown as the Pages site).

## Login

On first start Bros writes `{dataDir}/passkey` and prints `[bros] passkey: …` in the container logs. Setup/login stores a session cookie `bros_session`. Change the passkey in Settings.

## Dock

Desktop: left dock. Order is Dashboard, New chat, Models, Sidecars, Status, Previous chats, pinned sidecar UIs, then Docs + Settings, then a GitHub footer.

Previous chats: open, collapsible list. Recents overflow is Rename and Delete. Pinned sidecar UIs appear below a divider (no Pinned heading).

**Docs** in the dock expands to the full docs directory tree (Start, App, Sidecars, Popular services, Contribute). Every `docs/` page is a link, including Custom providers and each Popular service. Nested lists collapse; click a branch or chevron to close it even on the current page. The open branch follows the current page until closed. Dashboard…Status stay fully visible. Previous chats and the Docs tree each scroll with hidden scrollbars. Icon mode shows the Docs icon only.

## Recents and pins

Chat threads land under Previous chats after the first send. Sidecar web UIs with `navPinned` open as `http://127.0.0.1:<publish>/`.
