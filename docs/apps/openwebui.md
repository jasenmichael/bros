---
title: Open WebUI docker app
description: Alternate chat UI on host port 3080.
---

# Open WebUI docker app

Shipped **addon** package `lib/apps/addon/openwebui`. Alternate chat UI, separate from Bros Chat. Stopped until Autostart is on. A fresh install does not start it. Turn Autostart on and restart Bros, or press Start. List `openwebui` in `BROS_APPS_ENABLED` (or turn Autostart on) to start it on boot. Start still runs it when not listed.

## Ports

- Container: **8080**
- Host publish: **3080** (`BROS_OPENWEBUI_PORT` override)

Never publish host ports **3000** or **8080**. No `proxy.public` — Open/Pin stay LAN `http://127.0.0.1:3080/`.

## Binds

- `$BROS_DATA_DIR/apps/openwebui/data` → `/app/backend/data` (also `WEBUI_SECRET_KEY_FILE`)

Hub: [Docker apps](/docs/apps).
