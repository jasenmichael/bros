---
title: API
description: HTTP API for Bros. Session cookie, OpenAPI 3.1, every /api route.
---

# API

Machine-readable contract: [OpenAPI 3.1](/openapi.yaml) (`docs/api/openapi.yaml`). Import that file into Postman, Insomnia, or codegen. This page is the human index.

Base URL for a local app: `http://127.0.0.1:3055`. All JSON. Errors use Nitro `statusCode` + `statusMessage` (`{ statusCode, statusMessage, message }`).

Route files under `src/server/api/<surface>/` are the HTTP seam. Each handler stays thin and calls the matching module in `src/server/utils/`. Models are provider subpaths (`/api/providers/{id}/models`). There is no `/api/models`.

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

Public sidecar path prefixes (`/${id}/` when that webui sets `proxy.public`) use the same session cookie as `/chat`. They are not `/api/*` routes. No shipped pack opts in today. `/desktop/view/` is the Selkies stream. It is not an `/api` route and the proxy key does not authorize it.

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

`modelId` elsewhere is `providerId/model` (`ollama/llama3.2`).

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

There is no `/api/agent`. Public `GET /v1/models` and `POST /v1/chat/completions` on Bros itself are not implemented. Sidecar OpenAI paths are proxies, for example `/ollama/v1/chat/completions`.

## MCP, skills

Session cookie only.

| Method | Path | Notes |
| --- | --- | --- |
| GET, POST | `/api/mcp` | List or add `{ id, url }` |
| PATCH, DELETE | `/api/mcp/{id}` | Enable or remove |
| GET | `/api/skills` | Catalog name and description. No bodies. No internal skills |
| GET | `/api/skills/{id}` | One user skill, including the body |
| PUT | `/api/skills/{id}` | `{ body }` replaces the body and keeps the name. `{ markdown }` writes the file. Read-only autoload ids are rejected |

## Sidecars

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/sidecars` | List + `ollamaRestartNotice` |
| POST | `/api/sidecars` | Custom pack (`id`, `sidecarYml`, `composeYml`) |
| POST | `/api/sidecars/from-repo` | `{ url, name? }` |
| POST | `/api/apps/{id}/open` | Start that app's `gui` command on the desktop display in `bros-desktop`. Session only. |
| POST | `/api/apps/{id}/close` | Stop that display. Desktop stays up. Session only. |
| POST | `/api/sidecars/{id}/start` | Core Ollama and Whisper 400. Body `{ gui: true }` opens the GUI process on the desktop display when the container is already running, and returns 409 `Sidecar is not running` when it is down. It does not start the container. A start with no body starts the container and does not launch that process |
| POST | `/api/sidecars/{id}/stop` | Core Ollama and Whisper 400; via-tunnel may 403. Body `{ gui: true }` stops that display and leaves the container up. A stop with no body stops the container and, for a GUI sidecar, that display |
| POST | `/api/sidecars/{id}/restart` | Core Ollama and Whisper 400 |
| PATCH | `/api/sidecars/{id}/settings` | `autostart`, `navPinned`, `exposeHost` (stored, unused; Bros does not write a host PATH wrapper), `hostProbePort` |
| GET | `/api/cli/packages` | Installs on the desktop, plus a `managers` list (`kind`, `args`, `suggest`, `specLabel`, `placeholder`). A package with `services` includes `serviceRunning`. |
| GET | `/api/cli/suggest?kind=npm\|nix&q=` | Package name suggestions. npm from the registry. nix is a nixpkgs name |
| POST | `/api/cli/packages` | `{ kind: npm\|pnpm\|bun\|deno\|uv\|cargo\|nix\|apt\|deb\|run, spec, args?, bin?, clis?, volumes?, interfaces?, services? }` then rebuild Desktop. Enabled package apps install in the image build, not into the running container. `deb` spec is an https URL. Install downloads that file and apt installs it. Check reports an update only when a path segment is `latest` and the resolved URL changed. `services` is a command or `{ script }` relative to the app directory. It runs inside Desktop after Start. Enable does not start it. `run` may set `uninstall` to a command or a script beside `config.yml`. `volumes` is `host:container`, one per line, written with `webui` publish ports into `config/apps-compose.yml`. `interfaces` uses sidecar types. `gui` is `command` only. Open for an enabled `webui` is `http://127.0.0.1:<publish>/` |
| GET | `/api/apps/versions` | Installed versions for enabled package apps. Empty when Desktop is down. `kind: run` is omitted |
| POST | `/api/apps/{id}/update` | Update one package app or sidecar app. A registry sidecar image is pulled and recreated. A local image (compose `build`, image name with no registry) is rebuilt and recreated. A package update can run beside another. A `kind: run` update writes a force stamp and rebuilds Desktop. A second rebuild, or an update during a rebuild, returns 409 |
| GET | `/api/apps/{id}/update` | Check that app. Returns `available`, and `version` plus `latest` when Desktop reports them. A run command has no version check |
| POST | `/api/apps/{id}/enable` | Enable an addon app and rebuild Desktop so the image installs it |
| POST | `/api/apps/{id}/service` | `{ action: start \| stop }` for an enabled package app that has `services`. Writes `data/config/apps/running.json`. 404 when the app is missing, off, or has no services. 400 when `action` is anything else |
| PATCH | `/api/cli/packages/{id}` | Same body as POST. Keeps the id, then installs |
| DELETE | `/api/cli/packages/{id}` | Remove one install |
| GET | `/api/sidecars/{id}/logs` | Container logs |
| GET, PUT | `/api/sidecars/{id}/files` | Editable additional files |
| POST | `/api/sidecars/{id}/update` | `git pull` |

## Settings, status, tunnel

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, service, milestone, booting }` — no auth. `booting` is true until this process finishes autostart. The boot overlay polls this, not `/api/status`. |
| GET | `/api/status` | App, Docker, disk, GPU, sidecars (`phase`: starting/running/stopped/error), `booting` (true until this process finishes autostart), `containers`, `viaTunnel`, `ollamaRestartNotice` |
| GET | `/api/dashboard/summary` | Home hub: `chats`, `providers` (Chat-on rows + active pulls), `sidecars` (phase + web UI `openUrl`), `attention`, `tunnel`, `viaTunnel` |
| GET, PATCH | `/api/settings` | Paths, `enableHostOllama` / `enableWhisper`, `proxyKey`, `proxyUrls` |
| POST | `/api/settings/passcode` | `{ passcode }` |
| POST | `/api/settings/proxy-key` | Rotate. Returns `{ proxyKey }` |
| POST | `/api/settings/repair-data` | `chown` the host data dir to `BROS_HOST_UID`:`BROS_HOST_GID`. GET `/api/settings` includes `hostUid`, `hostGid`, and `repairCommand` |
| GET | `/api/tunnel` | Host cloudflared status |
| POST | `/api/tunnel/start` | 503 if helper down |
| POST | `/api/tunnel/stop` | 403 via-tunnel |
| GET | `/api/tunnel/logs` | Helper logs |
| GET | `/openapi.yaml` | This spec |

## Related

- [Providers](/docs/providers)
- [Chat](/docs/chat)
- [Sidecars](/docs/sidecars)
