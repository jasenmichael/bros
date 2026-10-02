---
title: Additional sidecars
description: User-created and git-cloned Compose packages.
---

# Additional sidecars

Everything that is not core (Ollama, Whisper) or a shipped addon. Listed on `/sidecars` under **Addon sidecars**. Source badge is **custom** (`$BROS_SIDECARS_DIR`) or **repo** (git clone).

## Add in the UI

`/sidecars` → Addon sidecars → **Add sidecar**. Bros writes `$BROS_SIDECARS_DIR/<id>/` (default `$BROS_DIR/sidecars`) with `sidecar.yml` plus `docker-compose.yml`. That directory is gitignored. The repo does not ship custom packs. Edit those files in the UI. Saving prompts a restart confirm so compose changes take effect.

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

A custom pack can later move into `lib/sidecars/addon/` or `lib/sidecars/core/`. An addon can later move to core. Until that move, the pack stays in `$BROS_SIDECARS_DIR` and stays out of git.

Hub: [Sidecars](/docs/sidecars).
