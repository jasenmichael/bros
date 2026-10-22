---
title: Open WebUI sidecar
description: Alternate chat UI on host port 3080.
---

# Open WebUI sidecar

Shipped **addon** package `lib/sidecars/addon/openwebui`. Alternate chat UI, separate from Bros Chat. Stopped until Autostart is on. A fresh install does not start it. Turn Autostart on and restart Bros, or press Start. Mark disabled with `BROS_SIDECAR_OPENWEBUI=0` or `BROS_SIDECARS_DISABLE=openwebui`. Still listed under Addon sidecars as **Open WebUI (addon)**.

## Ports

- Container: **8080**
- Host publish: **3080** (`BROS_OPENWEBUI_PORT` override)

Never publish host ports **3000** or **8080**. No `proxy.public` — Open/Pin stay LAN `http://127.0.0.1:3080/`.

## Binds

- `$BROS_HOST_DATA_DIR/sidecars/openwebui/data` → `/app/backend/data` (also `WEBUI_SECRET_KEY_FILE`)

Hub: [Sidecars](/docs/sidecars).
