---
title: Open WebUI sidecar
description: Alternate chat UI on host port 3080.
---

# Open WebUI sidecar

Shipped **addon** package `sidecars/addon/openwebui`. Alternate chat UI, separate from Bros Chat. Enabled by default. Disable autostart with `BROS_SIDECAR_OPENWEBUI=0` or `BROS_SIDECARS_DISABLE=openwebui`. Still listed under Addon sidecars with source **bros**.

## Ports

- Container: **8080**
- Host publish: **3080** (`BROS_OPENWEBUI_PORT` override)

Never publish host ports **3000** or **8080**. No `proxy.public` — Open/Pin stay LAN `http://127.0.0.1:3080/`.

## Binds

- `$BROS_HOST_DATA_DIR/openwebui/app/backend/data` → `/app/backend/data`

Hub: [Sidecars](/docs/sidecars).
