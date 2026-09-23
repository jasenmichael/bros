---
title: API
description: HTTP API for Bros. Session cookie, OpenAPI 3.1, every /api route.
---

# API

Machine-readable contract: [OpenAPI 3.1](/openapi.yaml) (`docs/api/openapi.yaml`). Import that file into Postman, Insomnia, or codegen. This page is the human index.

Base URL for a local app: `http://127.0.0.1:3055`. All JSON. Errors use Nitro `statusCode` + `statusMessage` (`{ statusCode, statusMessage, message }`).

## Auth

Most `/api/*` routes need a valid session cookie `bros_session` (HttpOnly, SameSite=Lax). Get it from `POST /api/auth/login` with `{ "passcode": "…" }` after setup. `GET /api/health` and `/api/auth/*` are open. `GET /openapi.yaml` is open.

There is no Bearer API token. Pass the cookie on each request:

```bash
curl -sS -c cookies -b cookies -X POST http://127.0.0.1:3055/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"passcode":"YOUR_PASSKEY"}'
curl -sS -b cookies http://127.0.0.1:3055/api/providers
```

401 = missing/invalid session or setup required. 403 = via-tunnel stop lock (tunnel stop, some sidecar stops). 400 = bad body. 404 = missing id.

Public sidecar path prefixes (`/${id}/` when that webui sets `proxy.public`) use the same session cookie as `/chat`. They are not `/api/*` routes. No shipped pack opts in today.

## Providers

List and configure Chat providers (Ollama sidecar `ollama`, host `ollama-host` when Settings enable host Ollama is on, 12 Popular services, custom OpenAI-compat rows). Host routes 404 when that toggle is off.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/providers` | Cards + health + embedded `models[]` (`name`, `enabled`) + `activePulls` |
| POST | `/api/providers` | Create/upsert (`id`, `name`, `kind`, optional key/config) |
| GET | `/api/providers/{id}` | One provider |
| PATCH | `/api/providers/{id}` | Chat `enabled`, or `name` / `apiKey` / `baseUrl` / `config` |
| DELETE | `/api/providers/{id}` | Custom only (built-in 400) |
| GET | `/api/providers/{id}/models` | `{ models, activePulls, error }` |
| PATCH | `/api/providers/{id}/models` | `{ name, enabled }` per-model Chat switch |
| DELETE | `/api/providers/{id}/models` | Ollama uninstall `{ name }` |
| GET | `/api/providers/{id}/models/library` | Ollama pull catalog |
| GET, POST | `/api/providers/{id}/models/pull` | List jobs / start (`{ model }`) |
| POST | `/api/providers/{id}/models/pull/stop` | `{ model }` |
| GET | `/api/providers/{id}/models/context` | `?model=` Ollama context length |
| POST | `/api/providers/{id}/gpu` | Sidecar only (`id=ollama`; host 400) |
| POST | `/api/providers/{id}/scan` | Host Ollama only (`id=ollama-host`); busts scan cache; 404 if disabled |

`modelId` elsewhere is `providerId/model` (`ollama/llama3.2`). Old `/api/models*` 301/308 for one release.

## Chat

UI conversations (SQLite). Not an OpenAI drop-in.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/chat` | `{ conversations }` |
| POST | `/api/chat` | `{ modelId }` required |
| GET, PATCH, DELETE | `/api/chat/{id}` | PATCH `modelId` and/or `title` |
| POST | `/api/chat/{id}/stream` | `{ content, modelId? }` — `text/plain` token stream |
| POST | `/api/chat/{id}/truncate` | `{ fromMessageId }` or `{ fromIndex }` — edit/resend |
| POST | `/api/chat/transcribe` | multipart `file` — `{ text }` from Whisper sidecar |

## Agent

Research threads (SQLite `conversations.kind = agent`). Not returned by `GET /api/chat`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/agent` | `{ conversations }` |
| POST | `/api/agent` | `{ modelId }` required |
| GET, PATCH, DELETE | `/api/agent/{id}` | PATCH `modelId` and/or `title` |
| POST | `/api/agent/{id}/stream` | `{ content, modelId? }` — SSE `status`, `token`, `sources`, `stats`, `error` |

## Sidecars

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/sidecars` | List + `ollamaRestartNotice` |
| POST | `/api/sidecars` | Additional pack (`id`, `sidecarYml`, `composeYml`) |
| POST | `/api/sidecars/from-repo` | `{ url, name? }` |
| POST | `/api/sidecars/{id}/start` | Core Ollama and Whisper 400 |
| POST | `/api/sidecars/{id}/stop` | Core Ollama and Whisper 400; via-tunnel may 403 |
| POST | `/api/sidecars/{id}/restart` | Core Ollama and Whisper 400 |
| PATCH | `/api/sidecars/{id}/settings` | `autostart`, `navPinned`, `hostProbePort` |
| GET | `/api/sidecars/{id}/logs` | Container logs |
| GET, PUT | `/api/sidecars/{id}/files` | Editable additional files |
| POST | `/api/sidecars/{id}/update` | `git pull` |

## Settings, status, tunnel

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, service, milestone }` — no auth |
| GET | `/api/status` | App, Docker, disk, GPU, sidecars, `containers`, `viaTunnel`, `ollamaRestartNotice` |
| GET, PATCH | `/api/settings` | Paths + `chatPrepend` / `chatAssistantDescription` / `enableHostOllama` |
| POST | `/api/settings/passcode` | `{ passcode }` |
| GET | `/api/tunnel` | Host cloudflared status |
| POST | `/api/tunnel/start` | 503 if helper down |
| POST | `/api/tunnel/stop` | 403 via-tunnel |
| GET | `/api/tunnel/logs` | Helper logs |
| GET | `/openapi.yaml` | This spec |

## Related

- [Providers](/docs/providers)
- [Chat](/docs/chat)
- [Sidecars](/docs/sidecars)
