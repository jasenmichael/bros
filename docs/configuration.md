---
title: Configuration
description: Bootstrap YAML, BROS_DIR, and host data binds.
---

# Configuration

## Bootstrap YAML

Only `working_dir` and `data_dir` belong in YAML. Load order:

1. `BROS_CONFIG` exclusive file, or
2. `.config/bros.yml` then `./bros.yml`
3. Env: `BROS_WORKING_DIR`, `BROS_DATA_DIR`

```yaml
working_dir: .
data_dir: ./data
```

All other settings live in SQLite (`bros.sqlite`) and the UI.

## `BROS_DIR` and host binds

`BROS_DIR` is the repo checkout when `./bros` sits next to `docker-compose.yml` + `sidecars/`. An installed binary uses `~/.bros`. Override with `BROS_DIR`.

Persistent binds live under `$BROS_DIR/data` (`BROS_HOST_DATA_DIR`):

- `$BROS_HOST_DATA_DIR` → app `/data` (SQLite, custom sidecars, logs)
- `$BROS_HOST_DATA_DIR/ollama` → Ollama `/root/.ollama`
- `$BROS_HOST_DATA_DIR/openwebui` → Open WebUI data
- `$BROS_HOST_DATA_DIR/opencode` → OpenCode workspace

In-container `BROS_DATA_DIR` stays `/data`. `./bros` copies leftover named volumes into empty dest dirs once (does not delete the volumes).

## Data directory layout

```text
$BROS_HOST_DATA_DIR/
  bros.sqlite
  sidecars/
  logs/
  ollama/
  openwebui/
  opencode/
```

Passcode, providers (including Ollama `config.customModels`), chat, and sidecar autostart/nav pins are stored in SQLite.

Do not commit `data/`, `.env`, `.nuxt`, or `node_modules`.
