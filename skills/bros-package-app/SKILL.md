---
name: bros-package-app
description: >-
  Add, enable, scan/adopt, and update Bros package apps (kinds node/npm/pnpm/bun/
  deno/uv/cargo/apt/deb/nix/run) inside Desktop. Use when installing CLIs or GUIs
  into the Desktop home — not docker compose packs.
---

# Package apps

A **package app** installs into the Desktop home (container `bros`). A **docker app** keeps its own compose project — use `bros-create-app` for those.

Docs: `$BROS_DIR/docs/apps.md` + `docs/apps/<id>.md` first, else GitHub. **Follow that page** for kind, spec, Enable, ports, and Start order.

## Tiers

| Tier | Location | Enable |
|------|----------|--------|
| Core | `lib/apps/core/<id>/` | Always on (package cores) |
| Addon | `lib/apps/addon/<id>/` | Off until Enable → `data/config/enabled-apps` |
| Custom | `data/config/apps/<id>/` | Enabled when config is written |

## Kinds (managers)

`npm`, `pnpm`, `bun`, `deno`, `uv`, `cargo`, `apt`, `deb`, `nix`, `run`. Shipped examples: Cursor (`deb`), OpenCode/Paperclip (`npm`), Agent/Claude (`run`), jq (`apt`).

`kind: run` = curl/wget install layer; Check has no version bump — Update forces Desktop **Rebuild**.

## API

```bash
KEY=$(cat "${BROS_DATA_DIR:-$BROS_DIR/data}/proxy-key")
# ensure / install
curl -sS -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  http://127.0.0.1:3055/api/cli/packages \
  -d '{"kind":"npm","spec":"@opencode/cli",...}'
# Scan / Adopt globals
curl -sS -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  http://127.0.0.1:3055/api/cli/packages/globals \
  -d '{...}'
```

Enable addon on `/apps` or via apps enable API. Services log to `data/var/logs/apps/<id>.log`. Package `webui` publish merges into Desktop compose; Start service before Open.

CLI: `bros app check|update <id>`. Rebuild queue: `POST /api/apps/rebuild` (waits for Desktop session).

Docker packs → `bros-create-app`. Auth → `bros-api`. GUI launch → `bros-desktop`.
