---
title: Pi docker app
description: Terminal coding agent. No host port.
---

# Pi docker app

Addon package `lib/apps/addon/pi`. [Pi](https://pi.dev/docs/latest/quickstart) (`@earendil-works/pi-coding-agent` **1.2.0**) on `node:22-bookworm-slim`. Stopped until Autostart is on. A fresh install does not start it. Turn Autostart on and restart Bros, or press Start. List `pi` in `BROS_APPS_ENABLED` (or turn Autostart on) to start it on boot. Start still runs it when not listed.

Pi is a terminal UI. This pack publishes no host port and has no Open button. The card shows the command `pi`.

Run it in the workspace bind:

```bash
docker compose -p bros-pi -f lib/apps/addon/pi/docker-compose.yml exec pi pi
```

`/login` stores credentials in `$BROS_DATA_DIR/home/.pi` (mounted at `/home/bros/.pi`). `/home/bros` is an empty tmpfs except the declared binds. Optional env passthrough: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`.

## Binds

- `$BROS_DATA_DIR/home/.pi` → `/home/bros/.pi` (auth, settings, sessions)
