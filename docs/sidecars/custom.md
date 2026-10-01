---
title: Additional sidecars
description: User-created and git-cloned Compose packages.
---

# Additional sidecars

Everything that is not core (Ollama, Whisper) or a shipped addon. Listed on `/sidecars` under **Addon sidecars**. Source badge is **custom** (`$BROS_SIDECARS_DIR`) or **repo** (git clone).

## Add in the UI

`/sidecars` → Addon sidecars → **Add sidecar**. Bros writes `$BROS_SIDECARS_DIR/<id>/` (default `$BROS_DIR/sidecars`) with `sidecar.yml` plus `docker-compose.yml`. That directory is gitignored. Edit those files in the UI. Saving prompts a restart confirm so compose changes take effect.

You can still drop the same files on disk.

Compose project name is `bros-sc-<id>` on network `bros`.

## From a repo

**From a repo** clones into `$BROS_SIDECARS_DIR/<name>/` and loads that tree’s `sidecars/` directory. Source badge is **repo**. **Update** is `git pull`; if `docker-compose.yml` changed, Bros prompts a restart.

## Rules

- Directory name must match `id` in `sidecar.yml`
- A `webui` interface must set `publish` and map `publish:containerPort` in Compose. Open is only that published webpage. A published `api` or `openai` shows copyable URLs and has no Open button. Pin in nav is only for a published `webui`.
- Open/Pin open `http://127.0.0.1:<publish>/` on LAN. `proxy.public: true` on a `webui` also enables same-host `/${id}/` via-tunnel (the UI must listen under that path). Default is no public proxy.
- Compose-app Bros talks to sidecar APIs at `http://<service>:<containerPort>` on network `bros`
- Stay on Docker network `bros`
- Do not publish host ports **3000** or **8080**
- Reserved ids include core/addon slugs (`ollama`, `opencode`, `openwebui`, `firecrawl`, `firecrawl-ui`, `openjev`, `whisper`), app routes (`api`, `chat`, `models`, `sidecars`, `settings`, `docs`, `login`, `setup`, `status`), and Popular services slugs (`openai`, `gemini`, …). Cannot create a custom `ollama`.

## Tracked starters

Repo ships six custom packs under `$BROS_DIR/sidecars/` (tracked; other `$BROS_SIDECARS_DIR` entries stay gitignored). Source badge is **custom**. Autostart is off until you enable it on `/sidecars`. Layout matches addon packs so they can move to `lib/sidecars/addon/` later.

| Id | Upstream | Publish | Notes |
| --- | --- | --- | --- |
| `open-seo` | [every-app/open-seo](https://github.com/every-app/open-seo) | **3001** (`BROS_OPEN_SEO_PORT`) | `ghcr.io/every-app/open-seo`. Set `DATAFORSEO_API_KEY` for SEO data. `AUTH_MODE=local_noauth`. |
| `octop` | [TencentCloud/Octop](https://github.com/TencentCloud/Octop) | **8088** (`BROS_OCTOP_PORT`) | `ghcr.io/tencentcloud/octop`. First boot writes admin creds to `$BROS_HOST_DATA_DIR/octop/data/.octop/credential.txt` unless `OCTOP_DEFAULT_PASSWORD` is set. |
| `paperclip` | [paperclipai/paperclip](https://github.com/paperclipai/paperclip) | **3100** (`BROS_PAPERCLIP_PORT`) | `ghcr.io/paperclipai/paperclip:latest` (stable). `local_trusted` + private. Pass `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` for agents. |
| `openhands` | [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands) | **8000** (`BROS_OPENHANDS_PORT`) | `ghcr.io/openhands/agent-canvas`. Docker UI at `/canvas`. Projects under `$BROS_HOST_DATA_DIR/openhands/projects`. Optional `LOCAL_BACKEND_API_KEY`; LLM keys in UI or env. |
| `omniroute` | [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) | **20128** (`BROS_OMNIROUTE_PORT`) | `diegosouzapw/omniroute:latest`. Dashboard + OpenAI-compat `/v1`. Data under `$BROS_HOST_DATA_DIR/omniroute/app/data`. Raise `OMNIROUTE_MEMORY_MB` for coding agents. |
| `trueforge` | [truefoundry/trueforge](https://github.com/truefoundry/trueforge) | **8791** (`BROS_TRUEFORGE_PORT`) | Local image `bros-trueforge:0.3.1` from npm `@truefoundry/trueforge@0.3.1`. Standalone SQLite at `$BROS_HOST_DATA_DIR/trueforge/db.sqlite`. UI at `/` (no `proxy.public`; no login). Container listens on **8790**. In TrueForge Settings, a custom model provider can use sidecar Ollama at `http://ollama:11434/v1`. Skills and Code Mode need a Daytona sandbox key. |

Hub: [Sidecars](/docs/sidecars).
