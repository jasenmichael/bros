---
title: Pi sidecar
description: Terminal coding agent. No host port.
---

# Pi sidecar

Addon package `lib/sidecars/addon/pi`. [Pi](https://pi.dev/docs/latest/quickstart) (`@earendil-works/pi-coding-agent` **1.2.0**) on `node:22-bookworm-slim`. Stopped until Autostart is on. A fresh install does not start it. Turn Autostart on and restart Bros, or press Start. Mark disabled with `BROS_SIDECAR_PI=0` or `BROS_SIDECARS_DISABLE=pi`. When disabled, the pack stays listed, does not autostart, Start still runs it, and the id stays reserved.

Pi is a terminal UI. This pack publishes no host port and has no Open button. The card shows the command `pi`.

Run it in the workspace bind:

```bash
docker compose -p bros-sc-pi -f lib/sidecars/addon/pi/docker-compose.yml exec pi pi
```

`/login` stores credentials in `$BROS_HOST_DATA_DIR/home/.pi` (mounted at `/home/bros/.pi`). `/home/bros` is an empty tmpfs except the declared binds. Optional env passthrough: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`.

## Binds

- `$BROS_HOST_DATA_DIR/home/.pi` → `/home/bros/.pi` (auth, settings, sessions)
