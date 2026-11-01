---
title: OmniRoute
description: OpenAI-compatible gateway on host port 20128. Provider setup stays in OmniRoute.
---

# OmniRoute

Addon package `lib/apps/addon/omniroute`. Image `diegosouzapw/omniroute:3.8.52`. Stopped until you press Start. A fresh install does not start it. List `omniroute` in `BROS_APPS_ENABLED` (or turn Autostart on) to start it on boot. Start still runs it when not listed.

Dashboard and the OpenAI-compatible API share container port **20128**. Host publish is **20128** (`BROS_OMNIROUTE_PORT`). Open is `http://127.0.0.1:20128/`. From Desktop and other containers the API base is `http://omniroute:20128/v1`.

`REQUIRE_API_KEY` is true. The first visit sets the dashboard password. `/v1` then needs a key created in that dashboard. Dashboard login reads `JWT_SECRET` from `OMNIROUTE_JWT_SECRET` in `$BROS_DATA_DIR/apps/omniroute/.env` (mode 0600, owned by the Desktop user). Bros creates that file on Start when missing. Do not put secrets in the pack directory — Compose opens pack `.env` as user `bros`, and a root-only file is `permission denied`. Override with env `OMNIROUTE_JWT_SECRET` when set.

Bros does not ship provider keys, model lists, combos, or an OpenCode provider block. Those stay in OmniRoute and OpenCode. Docker app Ollama is reachable from this pack at `http://ollama:11434/v1`. Connect that, any Bros provider, and any OmniRoute-only provider in the OmniRoute UI. Turn token compression off there before a coding agent uses the gateway.

Redis is `omniroute-redis` on network `bros`. It has no host port.

## Binds

- `$BROS_DATA_DIR/apps/omniroute/data` → `/app/data`
- `$BROS_DATA_DIR/apps/omniroute/redis` → `/data`
- `$BROS_DATA_DIR/apps/omniroute/.env` — `OMNIROUTE_JWT_SECRET` (not a volume bind; compose interpolation)

Hub: [Docker apps](/docs/apps.md).
