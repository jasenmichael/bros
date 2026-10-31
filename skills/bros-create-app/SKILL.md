---
name: bros-create-app
description: >-
  Helps create or wire Bros apps by interviewing the user, reading the matching
  docs/apps page, and choosing docker pack vs package vs enable-shipped vs
  from-repo. Use when adding a custom docker app, writing config.yml or
  docker-compose.yml, or when the user says add X to Bros.
---

# Create / wire a Bros app

Ask first. Do not invent a pack until the route is clear. Follow the install path on the app’s docs page.

## Doc resolution

1. `$BROS_DIR/docs` or `$BROS_DIR/docs` if present.
2. Else `https://raw.githubusercontent.com/jasenmichael/bros/main/docs/...`
3. Hub: `apps.md`, custom: `apps/custom.md`, shipped: `apps/<id>.md`.

## Interview

1. **Goal:** enable/configure a shipped app, author a new custom app, or clone a repo pack?
2. **Name / id:** proposed slug (must not hit reserved ids).
3. **Shape:** own Docker image/compose, install a binary into Desktop, or both unclear?

Read `docs/apps/<id>.md` (or hub) for that product. **That page wins** for kind, Enable vs Autostart, ports, and install command.

## Route

| Signal from docs / answers | Action |
|----------------------------|--------|
| Shipped addon with Enable / Settings path | Enable or configure; do not reinvent the pack. Hand off `bros-package-app` or `bros-api` as needed |
| Package kinds (`npm`, `deb`, `run`, `apt`, `nix`, …) | Load **`bros-package-app`** |
| Own compose / image | Stay here — docker custom pack |
| External git tree with `apps/` | `POST /api/apps/from-repo` `{ url, name? }` |

HTTP details → `bros-api`. GUI / Drawer → `bros-desktop`.

## Docker custom pack

Writes `data/config/apps/<id>/` with `config.yml` (`kind: docker`) + `docker-compose.yml`. UI: `/apps` → **Add app**. API:

```bash
curl -sS -X POST "http://127.0.0.1:3055/api/apps" \
  -H "Authorization: Bearer $(cat "${BROS_DATA_DIR:-$BROS_DIR/data}/proxy-key")" \
  -H "Content-Type: application/json" \
  -d '{"id":"myapp","configYml":"...","composeYml":"..."}'
```

Rules:

- Compose project `bros-<id>` on network `bros`
- `webui`: `publish` in config + `publish:containerPort` in compose; Pin/Open only for published webui
- `gui`: `service` + `command`; no `publish`; launch from Desktop after container is running
- `api` / `openai`: proxied at `/<id><basePath>` (openai default `/v1`); no Open button
- Do not publish host ports **3000** or **8080**
- Directory name must match `id` in `config.yml`
- Reserved ids include shipped cores/addons and route slugs (`ollama`, `opencode`, `chat`, `api`, …)

Start: `POST /api/apps/{id}/start` (core Ollama/Whisper start/stop return 400). Edit files: `GET|PUT /api/apps/{id}/files`.

Minimal `config.yml` shape:

```yaml
id: myapp
kind: docker
name: My App
interfaces:
  webui:
    publish: 3099
```

Promote later by moving the dir to `lib/apps/addon/<id>/` or `lib/apps/core/<id>/` in the Bros checkout (`bros-dev`).
