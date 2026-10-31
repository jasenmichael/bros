---
title: API
description: HTTP API for Bros. Session cookie, OpenAPI 3.1, every /api route.
---

# API

Machine-readable contract: [OpenAPI 3.1](/openapi.yaml) (`docs/api/openapi.yaml`). Import that file into Postman, Insomnia, or codegen. This page is the human index.

Base URL for a local app: `http://127.0.0.1:3055`. All JSON. Errors use Nitro `statusCode` + `statusMessage` (`{ statusCode, statusMessage, message }`).

Route files under `app/server/api/<surface>/` are the HTTP seam. Each handler stays thin and calls the matching module in `app/server/utils/`. Models are provider subpaths (`/api/providers/{id}/models`). There is no `/api/models`.

## Auth

Most `/api/*` routes need a valid session cookie `bros_session` (HttpOnly, SameSite=Lax). Get it from `POST /api/auth/login` with `{ "passcode": "…" }` after setup. `GET /api/health` and `/api/auth/*` are open. `GET /openapi.yaml` is open.

The host CLI uses `Authorization: Bearer <proxy-key>` (file `$BROS_DATA_DIR/proxy-key`) for machine calls such as `POST /api/apps/compose`. That header does not create a browser session. Browsers use the cookie:

```bash
curl -sS -c cookies -b cookies -X POST http://127.0.0.1:3055/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"passcode":"YOUR_PASSKEY"}'
curl -sS -b cookies http://127.0.0.1:3055/api/providers
curl -sS -H "Authorization: Bearer $(cat "$BROS_DATA_DIR/proxy-key")" \
  -X POST http://127.0.0.1:3055/api/apps/compose
```

401 = missing/invalid session or setup required. 403 = via-tunnel stop lock (tunnel stop, some docker app stops). 400 = bad body. 404 = missing id.

Public docker app path prefixes (`/${id}/` when that webui sets `proxy.public`) use the same session cookie as `/chat`. They are not `/api/*` routes. No shipped pack opts in today. `/desktop/view/` is the Selkies stream. It is not an `/api` route and the proxy key does not authorize it.

## Providers

List and configure Chat providers (Ollama docker app `ollama`, host `ollama-host` when Settings enable host Ollama is on, 12 Popular services, custom OpenAI-compat rows). Host routes 404 when that toggle is off.

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
| POST | `/api/providers/{id}/gpu` | Docker app only (`id=ollama`; host 400) |
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
| POST | `/api/chat/transcribe` | multipart `file` — `{ text }` from Whisper docker app |

There is no `/api/agent`. Public `GET /v1/models` and `POST /v1/chat/completions` on Bros itself are not implemented. Docker app OpenAI paths are proxies, for example `/ollama/v1/chat/completions`.

## Agents

The `/agents` board. Session cookie. Secrets come back masked (`set`, `last4`).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/agents` | Settings, projects, issues, jobs |
| PUT | `/api/agents` | Runtime, keys, switches. Empty secret fields do not clear. `githubTokenClear` / `cursorKeyClear` remove that secret |
| POST | `/api/agents/projects` | `{ fullName, defaultBranch?, path? }` registers a repo under Workspace. No clone |
| PUT | `/api/agents/projects/{name}` | `{ prBase }` `staging` or `main` |
| PATCH | `/api/agents/projects/{name}` | `{ defaultBranch?, path?, enabled?, prBase? }` |
| DELETE | `/api/agents/projects/{name}` | Removes the row. Does not delete the directory |
| POST | `/api/agents/jobs` | `{ project, issueNumber }` starts preflight |
| GET | `/api/agents/jobs/{id}` | Job plus event transcript |
| POST | `/api/agents/jobs/{id}/action` | `{ action: approve \| approve_pr \| cancel, taskSpec? }` |
| DELETE | `/api/agents/jobs/{id}` | Clear a failed, timed out, or cancelled row. Does not delete the repo |

## MCP, skills

Session cookie only.

| Method | Path | Notes |
| --- | --- | --- |
| GET, POST | `/api/mcp` | List or add `{ id, url }` |
| PATCH, DELETE | `/api/mcp/{id}` | Enable or remove |
| GET | `/api/skills` | Catalog name and description. No bodies. No internal skills |
| GET | `/api/skills/{id}` | One user skill, including the body |
| PUT | `/api/skills/{id}` | `{ body }` replaces the body and keeps the name. `{ markdown }` writes the file. Read-only autoload ids are rejected |

## Apps

Store list is `GET /api/apps`. Compose start, stop, restart, settings, and files are `/api/apps/:id/...`. Git pull is `POST /api/apps/:id/repo`. Image and package update stay `POST /api/apps/:id/update`. Addon boot list is `BROS_APPS_ENABLED`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/apps` | Store list: `apps`, `docker`, `packages`, plus `errors`, `viaTunnel`, `ollamaRestartNotice` |
| POST | `/api/apps` | Custom pack (`id`, `configYml`, `composeYml`) |
| POST | `/api/apps/from-repo` | `{ url, name? }` |
| POST | `/api/apps/{id}/open` | Start another window of that app's `gui` command on the desktop display in `bros`. Session only. |
| POST | `/api/apps/{id}/close` | Body `{ one: true }` kills the newest window. Without it, stop kills every window of that command. Desktop stays up. Session only. |
| POST | `/api/desktop/terminal` | `{ open: true }` starts another foot window in `/home/bros/workspace`. `{ close: true }` kills the newest. `{ open: false }` kills every terminal window. |
| POST | `/api/desktop/focus` | `{ kind, id, command? }` focuses a mapped window for that library app. If none is mapped, it opens one. |
| POST | `/api/desktop/entry` | `{ id }` starts another window for a desktop entry that is not already a package or docker app gui. `{ id, close: true }` kills the newest window. |
| POST | `/api/desktop/pins` | `{ kind, id, command? }` pins that library app. `kind` is `terminal`, `package`, `docker`, or `entry`. |
| DELETE | `/api/desktop/pins/{id}` | Unpin that library app |
| POST | `/api/desktop/pins/{id}/open` | Open the pinned app |
| POST | `/api/desktop/pins/{id}/close` | Close the newest window for that pin |
| GET | `/api/desktop/drawer` | `{ entries, library }` for the desktop drawer. Catalog comes from `docker exec` into container `bros` |
| GET | `/api/desktop/icons?name=` | Icon bytes. Prefers `icon.png` beside the app config (core, addon, or custom). When that file is missing, reads a desktop/pixmap icon via `docker exec` into container `bros`. 404 when the name is missing or neither file is found |
| POST | `/api/apps/{id}/start` | Core Ollama and Whisper 400. Body `{ gui: true }` opens another GUI window on the desktop display when the container is already running, and returns 409 `Docker app is not running` when it is down. It does not start the container. A start with no body starts the container and does not launch that process |
| POST | `/api/apps/{id}/stop` | Core Ollama and Whisper 400; via-tunnel may 403. Body `{ gui: true, one: true }` kills the newest GUI window. Body `{ gui: true }` kills every GUI window for that docker app and leaves the container up. A stop with no body stops the container and, for a GUI docker app, every GUI window |
| POST | `/api/apps/{id}/restart` | Core Ollama and Whisper 400 |
| PATCH | `/api/apps/{id}/settings` | `autostart`, `navPinned`, `exposeHost` (stored, unused; Bros does not write a host PATH wrapper), `hostProbePort` |
| GET | `/api/cli/packages` | Installs on the desktop, plus a `managers` list (`kind`, `args`, `suggest`, `specLabel`, `placeholder`). A package with `services` includes `serviceRunning`. `?rebuild=1` writes the desktop build and returns `rebuildPending` when that run set differs from the last stamp |
| GET | `/api/cli/packages/globals` | Top-level global packages inside container `bros` for npm, pnpm, bun, uv, cargo, and nix. `{ kinds: { kind, names: { name, owned }[], error? }[] }`. `owned` means a package app of that kind already has that spec. Does not install |
| POST | `/api/cli/packages/globals` | `{ kind, spec }` writes an enabled custom package app at `data/config/apps/<id>/config.yml`. Refuses when that kind and spec are already an app, or the id is taken or reserved. Does not install and does not call `applyCliPackages` |
| GET | `/api/cli/suggest?kind=npm\|nix&q=` | Package name suggestions. npm from the registry. nix is a nixpkgs name |
| POST | `/api/cli/packages` | `{ kind: npm\|pnpm\|bun\|deno\|uv\|cargo\|nix\|apt\|deb\|run, spec, args?, bin?, clis?, volumes?, interfaces?, services? }` then ensure that app. `kind: run` queues Rebuild on `/apps` and does not rebuild on add. Other kinds do not rebuild. `deb` spec is an https URL. Install downloads that file and apt installs it. Check reports an update only when a path segment is `latest` and the resolved URL changed. `services` is a command or `{ script }` relative to the app directory. It runs inside Desktop after Start. Enable does not start it. `run` may set `uninstall` to a command or a script beside `config.yml`. `volumes` is `host:container`, one per line, written with `webui` publish ports into `config/apps-compose.yml`. `interfaces` uses docker app types. `gui` is `command` only. Open for a package `webui` is `http://127.0.0.1:<publish>/` on `/apps` only while enabled, Forward to host is on, and (when `services` exist) the service is running |
| GET | `/api/apps/versions` | Installed versions for enabled package apps, including `kind: run` when a version command exists. Empty when Desktop is down |
| POST | `/api/apps/{id}/update` | Update one package app or docker app. A registry docker app image is pulled and recreated. A local image (compose `build`, image name with no registry) is rebuilt and recreated. A package update can run beside another. A `kind: run` update writes a force stamp and rebuilds Desktop. A second rebuild, or an update during a rebuild, returns 409 |
| GET | `/api/apps/{id}/update` | Check that app. Returns `available`, and `version` plus `latest` when Desktop reports them. A run command has no version check. Node is available only when the installed version is missing or lower than `BROS_NODE_VERSION` |
| GET | `/api/apps/ensure` | `{ running, current, version, failures }` for the ensure toast |
| POST | `/api/apps/{id}/enable` | Enable an addon app and queue ensure. Adds the id to `data/config/enabled-apps`. Does not write `data/config/apps/<id>/config.yml`. `kind: run` does not rebuild; `/apps` shows Rebuild when the run set differs from the last stamp |
| POST | `/api/apps/{id}/disable` | Addon only. Removes the id from `data/config/enabled-apps` and queues removal of the command. Does not write a config. Caches stay. Core returns 404 |
| GET | `/api/apps/{id}/logs` | Docker compose logs when the id is a docker app. Otherwise the tail of `data/var/logs/apps/<id>.log` for a package that has a service. The file stays after Stop |
| POST | `/api/apps/{id}/service` | `{ action: start \| stop \| restart }` for an enabled package app that has `services`. Writes `data/config/apps/running.json`. Restart bumps that id's count. 404 when the app is missing, off, or has no services. 400 when `action` is anything else |
| POST | `/api/apps/rebuild` | Rebuild the Desktop image for the current `kind: run` set and swap the container. 409 while a rebuild is in progress |
| POST | `/api/apps/{id}/ui` | `{ forwardHost?, navPinned? }` for a package web UI. `forwardHost` publishes `publish:containerPort` and proxies `/${id}/`. Default forward is on |
| PATCH | `/api/cli/packages/{id}` | Same body as POST. Keeps the id, then installs |
| DELETE | `/api/cli/packages/{id}` | Remove one install |
| GET, PUT | `/api/apps/{id}/files` | Editable custom docker app files |
| POST | `/api/apps/{id}/repo` | `git pull` for a cloned docker app |

## Settings, status, tunnel

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, service, milestone, booting }` — no auth. `booting` is true until this process finishes autostart. The boot overlay polls this, not `/api/status`. |
| GET | `/api/status` | App, Docker, disk, GPU, docker apps (`phase`: starting/running/stopped/error), `booting` (true until this process finishes autostart), `containers`, `viaTunnel`, `ollamaRestartNotice` |
| GET | `/api/dashboard/summary` | Home hub: `chats`, `providers` (Chat-on rows + active pulls), `docker apps` (phase + web UI `openUrl`), `attention`, `tunnel`, `viaTunnel` |
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
- [Docker apps](/docs/apps)
