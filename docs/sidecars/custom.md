---
title: Additional sidecars
description: User-created and git-cloned Compose packages.
---

# Additional sidecars

Everything that is not core Ollama or a shipped addon. Listed on `/sidecars` under **Addon sidecars**. Source badge is **custom** (data dir) or **repo** (git clone).

## Add in the UI

`/sidecars` → Addon sidecars → **Add sidecar**. Bros writes `$BROS_HOST_DATA_DIR/sidecars/<id>/` with `sidecar.yml` plus `docker-compose.yml` (in-container `/data/sidecars/<id>/`). Edit those files in the UI. Saving prompts a restart confirm so compose changes take effect.

You can still drop the same files on disk.

Compose project name is `bros-sc-<id>` on network `bros`.

## From a repo

**From a repo** clones into `$BROS_HOST_DATA_DIR/sidecar-repos/<name>/` and loads that tree’s `sidecars/` directory (same rules as repo `sidecars/`). Source badge is **repo**. **Update** is `git pull`; if `docker-compose.yml` changed, Bros prompts a restart.

## Rules

- Directory name must match `id` in `sidecar.yml`
- A `webui` interface must set `publish` and map `publish:containerPort` in Compose. A published `api` is Open/Pin the same way.
- Open/Pin always open `http://127.0.0.1:<publish>/`
- Stay on Docker network `bros`
- Do not publish host ports **3000** or **8080**
- Reserved ids include core/addon slugs (`ollama`, `opencode`, `openwebui`, `firecrawl`, `firecrawl-ui`), app routes (`api`, `chat`, `models`, `sidecars`, `settings`, `docs`, `login`, `setup`, `status`), and Popular services slugs (`openai`, `gemini`, …). Cannot create a custom `ollama`.

Hub: [Sidecars](/docs/sidecars).
