---
name: bros-api
description: >-
  Call the Bros HTTP API: base URL, session cookie vs proxy-key Bearer, OpenAPI,
  and key route groups. Use when curling Bros, scripting against /api/*, or
  configuring Cursor Override Base URL.
---

# Bros HTTP API

Base: `http://127.0.0.1:3055` (or tunnel hostname — see `bros-tunnel`).

## Doc resolution

1. `$BROS_DIR/docs/api.md` or `$BROS_DIR/docs/api.md`
2. Else `https://raw.githubusercontent.com/jasenmichael/bros/main/docs/api.md`
3. Live contract: `GET http://127.0.0.1:3055/openapi.yaml`

## Auth

| Client | How |
|--------|-----|
| Browser | `POST /api/auth/login` `{ "passcode": "..." }` → cookie `bros_session` |
| CLI / machine | `Authorization: Bearer <proxy-key>` — file `$BROS_DATA_DIR/proxy-key` (else under `$BROS_DIR/data/`) |
| Open (no auth) | `GET /api/health`, `/api/auth/*`, `/openapi.yaml` |

```bash
KEY=$(cat "${BROS_DATA_DIR:-$BROS_DIR/data}/proxy-key")
curl -sS -H "Authorization: Bearer $KEY" http://127.0.0.1:3055/api/apps
```

Passkey lives in logs / `$BROS_DIR/data/passkey` after first start. Never commit keys.

## Route groups

| Group | Paths |
|-------|-------|
| Providers | `/api/providers`, `…/{id}/models`, pull/scan/gpu |
| Chat | `/api/chat`, `…/{id}/stream`, truncate, transcribe — not OpenAI-compatible |
| Agents | `/api/agents`, projects, jobs, approve |
| Apps | `GET\|POST /api/apps`, `from-repo`, `{id}/start\|stop\|restart\|settings\|files\|update\|enable\|disable\|logs\|repo`, `compose`/`check`/`rebuild` |
| Packages | `/api/cli/packages`, globals, suggest |
| Desktop | drawer, pins, terminal, focus, entry, open/close GUI |
| Settings / status / tunnel | `/api/settings*`, `/api/status`, `/api/dashboard/summary`, `/api/tunnel*` |
| Runtime Chat skills | `GET\|PUT /api/skills` — user catalog bodies, not this pack |

## Proxied docker APIs

Every docker `api` / `openai` interface: `/<id><basePath>` strips `/<id>` before upstream (e.g. `/ollama/v1` → ollama `:11434/v1`). Needs session or proxy-key. Stopped id → 404.

Pack CRUD helpers: `bros-create-app`, `bros-package-app`. Lifecycle binary: `bros-cli`.
