---
title: Custom sidecars
description: User-created and git-cloned Compose packages.
---

# Custom sidecars

Everything that is not core (Ollama, Desktop, Whisper) or a shipped addon. Listed on `/sidecars`. Heading kind is **(custom)** (`lib/sidecars/custom`) or **(repo)** (git clone). Stopped until Autostart is on. A fresh install does not start it.

## Add in the UI

`/sidecars` → **Add sidecar**. Bros writes `lib/sidecars/custom/<id>/` with `sidecar.yml` plus `docker-compose.yml`. Only `lib/sidecars/custom/README.md` is tracked. Pack files stay on disk. Edit those files in the UI. Saving prompts a restart confirm so compose changes take effect.

You can still drop the same files on disk. Apps and packages are not sidecars. Add them on `/settings/desktop`. See [Apps](/docs/apps).

Compose project name is `bros-sc-<id>` on network `bros`.

## From a repo

**From a repo** clones into `lib/sidecars/custom/<name>/` and loads that tree’s `sidecars/` directory. Source badge is **repo**. **Update** is `git pull`; if `docker-compose.yml` changed, Bros prompts a restart.

## Rules

- Directory name must match `id` in `sidecar.yml`
- A `webui` interface must set `publish` and map `publish:containerPort` in Compose. Open is only that published webpage. A published `api` or `openai` shows copyable URLs and has no Open button. Pin in nav is only for a published `webui`. A hand-written `gui` interface cannot set `publish`.
- Open/Pin open `http://127.0.0.1:<publish>/` on LAN. `proxy.public: true` on a `webui` also enables same-host `/${id}/` via-tunnel (the UI must listen under that path). Default is no public proxy.
- Compose-app Bros talks to sidecar APIs at `http://<service>:<containerPort>` on network `bros`
- Stay on Docker network `bros`
- Do not publish host ports **3000** or **8080**
- Reserved ids include core slugs and addon slugs (`ollama`, `opencode`, `openwebui`, `firecrawl`, `firecrawl-ui`, `openjev`, `pi`, `omniroute`, `cursor`, `whisper`, `cli`), app routes (`api`, `chat`, `models`, `sidecars`, `settings`, `docs`, `login`, `setup`, `status`, `gui`), and Popular services slugs (`openai`, `gemini`, …). A disabled shipped addon still reserves its id and slug. Cannot create a custom `ollama` or `gui`.

A custom pack can later move into `lib/sidecars/addon/` or `lib/sidecars/core/`. An addon can later move to core. Until that move, the pack stays in `lib/sidecars/custom` and stays out of git.

Hub: [Sidecars](/docs/sidecars).
