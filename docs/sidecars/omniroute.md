---
title: OmniRoute
description: OpenAI-compatible gateway on host port 20128. Provider setup stays in OmniRoute.
---

# OmniRoute

Addon package `lib/sidecars/addon/omniroute`. Image `diegosouzapw/omniroute:3.8.52`. Stopped until Autostart is on. A fresh install does not start it. Turn Autostart on and restart Bros, or press Start. Mark disabled with `BROS_SIDECAR_OMNIROUTE=0` or `BROS_SIDECARS_DISABLE=omniroute`. When disabled, the pack stays listed, does not autostart, Start still runs it, and the id stays reserved.

Dashboard and the OpenAI-compatible API share container port **20128**. Host publish is **20128** (`BROS_OMNIROUTE_PORT`). Open is `http://127.0.0.1:20128/`. From Desktop and other containers the API base is `http://omniroute:20128/v1`.

`REQUIRE_API_KEY` is true. The first visit sets the dashboard password. `/v1` then needs a key created in that dashboard. Dashboard login reads `JWT_SECRET` from `OMNIROUTE_JWT_SECRET` in the gitignored pack `.env`. Leave that unset and login stays disabled.

Bros does not ship provider keys, model lists, combos, or an OpenCode provider block. Those stay in OmniRoute and OpenCode. Sidecar Ollama is reachable from this pack at `http://ollama:11434/v1`. Connect that, any Bros provider, and any OmniRoute-only provider in the OmniRoute UI. Turn token compression off there before a coding agent uses the gateway.

Redis is `omniroute-redis` on network `bros`. It has no host port.

## Binds

- `$BROS_HOST_DATA_DIR/sidecars/omniroute/data` → `/app/data`
- `$BROS_HOST_DATA_DIR/sidecars/omniroute/redis` → `/data`

Hub: [Sidecars](/docs/sidecars).
