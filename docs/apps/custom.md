---
title: Custom apps
description: Docker apps the user adds. Not in the repo.
---

# Custom apps

A custom docker app is everything that is not Ollama, Whisper, or a shipped app. Listed on `/apps`. Heading kind is **(custom)** (`data/config/apps`) or **(repo)** (git clone). Stopped until Start. A fresh install does not start it.

## Add in the UI

`/apps` → **Add app**. Bros writes `data/config/apps/<id>/` with `config.yml` (`kind: docker`) plus `docker-compose.yml`. That tree is gitignored with the rest of `data/`. Edit those files in the UI. Saving prompts a restart confirm so compose changes take effect. Volume binds belong in that compose file only.

Package apps are not docker apps. Add them on `/apps`. See [Apps](/docs/apps.md). A custom package app uses the same directory with a package-manager `kind`.

Compose project name is `bros-<id>` on network `bros`.

## From a repo

**From a repo** clones into `data/config/apps/<name>/` and loads that tree’s `apps/` directory. Source badge is **repo**. **Update** is `git pull`; if `docker-compose.yml` changed, Bros prompts a restart.

## Rules

- Directory name must match `id` in `config.yml`
- A `webui` interface must set `publish` and map `publish:containerPort` in Compose. Open is only that published webpage. A published `api` or `openai` shows copyable URLs and has no Open button. Pin in nav is only for a published `webui`. A hand-written `gui` interface cannot set `publish`.
- Open/Pin open `http://127.0.0.1:<publish>/` on LAN. `proxy.public: true` on a `webui` also enables same-host `/${id}/` via-tunnel (the UI must listen under that path). Default is no public proxy.
- Compose-app Bros talks to docker app APIs at `http://<service>:<containerPort>` on network `bros`
- Stay on Docker network `bros`
- Do not publish host ports **3000** or **8080**
- Reserved ids include core slugs and addon slugs (`ollama`, `opencode`, `openwebui`, `firecrawl`, `firecrawl-ui`, `openjev`, `pi`, `omniroute`, `cursor`, `whisper`, `cli`), app routes (`api`, `chat`, `models`, `docker apps`, `settings`, `docs`, `login`, `setup`, `status`, `gui`), and Popular services slugs (`openai`, `gemini`, …). A disabled shipped addon still reserves its id and slug. Cannot create a custom `ollama` or `gui`.

A custom app can later move into `lib/apps/addon/<id>/` or `lib/apps/core/<id>/`. An addon can later move to core. Until that move, the directory stays in `data/config/apps` and stays out of git.

Hub: [Docker apps](/docs/apps.md).
