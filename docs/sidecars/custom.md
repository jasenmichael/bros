---
title: Custom sidecars
description: Drop-in Compose packages under the host data dir.
---

# Custom sidecars

Drop-in a directory at `$BROS_HOST_DATA_DIR/sidecars/<id>/` with `sidecar.yml` plus `docker-compose.yml`. There is **no** add/upload UI.

Compose project name is `bros-sc-<id>` on network `bros`.

## Rules

- Directory name must match `id` in `sidecar.yml`
- A `webui` interface must set `publish` and map `publish:containerPort` in Compose
- Open/Pin always open `http://127.0.0.1:<publish>/`
- Stay on Docker network `bros`
- Do not publish host ports **3000** or **8080**
- Reserved ids include app routes (`api`, `chat`, `models`, `sidecars`, `settings`, `docs`, `login`, `setup`, `status`) and Popular services slugs (`openai`, `gemini`, …)

Hub: [Sidecars](/docs/sidecars).
