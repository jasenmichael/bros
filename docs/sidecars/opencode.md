---
title: OpenCode sidecar
description: CLI coding agent with web UI on host port 4097.
---

# OpenCode sidecar

Core package `sidecars/opencode`. CLI coding agent with web UI (anomalyco/opencode).

## Ports

- Container: **4096**
- Host publish: **4097** (`BROS_OPENCODE_PORT` override)

Open/Pin always use `http://127.0.0.1:4097/`. Pin from Sidecars to keep it in the dock.

## Binds

- `$BROS_HOST_DATA_DIR/opencode` → `/workspace`
- `$BROS_HOST_DATA_DIR/opencode-config` → `/root/.config/opencode`
- `$BROS_HOST_DATA_DIR/opencode-share` → `/root/.local/share/opencode`

Hub: [Sidecars](/docs/sidecars).
