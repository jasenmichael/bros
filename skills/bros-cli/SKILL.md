---
name: bros-cli
description: >-
  Operate the Bros stack with the bros CLI (start/stop/update/run/shell/app
  update) and env flags. Use when starting Bros, installing the systemd user
  service, or host lifecycle — not pack CRUD (that is the HTTP API).
---

# Bros CLI

Binary: `bros`. Default action is **start**. Install tree: `$BROS_DIR` / `$BROS_HOME`. Docs: resolve `$BROS_HOME/docs/cli.md` else GitHub `docs/cli.md`.

## Commands

| Command | Role |
|---------|------|
| `bros` / `bros start` | UI + health + compose merge + Desktop up |
| `bros stop` / `restart` / `status` | Full stack |
| `bros check` | `POST /api/apps/check` |
| `bros update` / `upgrade` | Release tarball or source pull + rebuild |
| `bros run` / `shell` | `docker exec` into container `bros` |
| `bros app check\|update <id>` | Per-app update API |
| `bros service install\|uninstall\|status` | systemd `--user` |

## Flags / env

| Flag / env | Meaning |
|------------|---------|
| `--dev` / `BROS_DEV=1` | Hot-reload UI on host (checkout; needs pnpm + cargo) |
| `--use-runner` / `BROS_USE_RUNNER=1` | Force UI runner container `bros-ui` (errors with `--dev`) |
| `-D` | Detach where supported (ignored in `--dev`) |
| `-i` / `-c` / `--verbose` | See `docs/cli.md` |

Release install does not need git/cargo/Node. Checkout build: see `bros-dev`.

## Not CLI

Creating or editing app packs is **API / UI only** → `bros-create-app` / `bros-api` / `bros-package-app`.
