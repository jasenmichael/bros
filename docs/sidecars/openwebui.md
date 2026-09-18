---
title: Open WebUI sidecar
description: Alternate chat UI on host port 3080.
---

# Open WebUI sidecar

Core package `sidecars/openwebui`. Alternate chat UI, separate from Bros Chat.

## Ports

- Container: **8080**
- Host publish: **3080** (`BROS_OPENWEBUI_PORT` override)

Never publish host ports **3000** or **8080**. Open/Pin: `http://127.0.0.1:3080/`.

## Binds

- `$BROS_HOST_DATA_DIR/openwebui` → `/app/backend/data`

Hub: [Sidecars](/docs/sidecars).
