---
title: Configuration
description: bros.yml in the data config dir, and host data binds.
---

# Configuration

## Bootstrap YAML

The app loads `$BROS_DIR/bros.yml` (same as `$BROS_DIR/bros.yml`). It does not read `~/.config/bros.yml`. A leftover `$BROS_DATA_DIR/config/bros.yml` is moved to `$BROS_DIR/bros.yml` on startup when the home file is missing.

```yaml
tunnel: true
public_url: https://bros.example.com
enable_host_ollama: false
enable_whisper: false
```

`tunnel` (or env `BROS_TUNNEL`) opts in the host Cloudflare tunnel; default off. `public_url` is the advertised hostname for a named tunnel when the tunnel is enabled (never an enable signal by itself). `enable_host_ollama` and `enable_whisper` default off. Chat prepend and assistant description are the `rules` and `personality` skill files. Provider API keys stay in SQLite (no `OPENAI_API_KEY` env). Passkey and session secret are files under the data dir.

Full `BROS_*` list: [Environment](/docs/environment.md). Tunnel: [Tunnel](/docs/tunnel.md).

## `BROS_DIR` and host binds

When running `bros` with `BROS_DIR` unset, `BROS_DIR` is the real directory of the `bros` script (symlink-aware: `~/.local/bin/bros` → `$BROS_DIR/bros`). An installed clone is typically `~/.bros`. `BROS_DIR` is an alias. `install.sh` writes `$BROS_DIR/bros.yml` when missing and symlinks `BROS_BIN` (`~/.local/bin/bros`) to `$BROS_DIR/bros`.

Persistent binds live under `$BROS_DIR/data` (`BROS_DATA_DIR`). The image sets `BROS_DIR=/app`, so that directory is `/app/data` inside the container. Start does not copy leftover named volumes into those dirs.

Docker apps are `lib/apps/core/ollama` and `lib/apps/core/whisper`. Package apps are `lib/apps/core/<id>` and `lib/apps/addon/<id>`. A custom app is `data/config/apps/<id>` and is not in the repo. That directory is custom apps only. Addon package enable is one id per line in `data/config/enabled-apps`. A missing file means none enabled. Moving a custom directory into `lib/apps/addon` or `lib/apps/core` ships it. The Bros image is `lib/desktop`. Dev mounts the checkout at `/app`.

## Directory layout

```text
$BROS_DIR/lib/apps/
  core/<id>/                  # package cores, plus docker cores ollama and whisper
  addon/<id>/                 # package apps and docker apps

$BROS_DIR/lib/desktop/        # the Bros image
```

```text
$BROS_DIR/
  bros.yml                       # bootstrap YAML (tunnel, public_url, whisper, host ollama, workspace)
  data/                          # $BROS_DATA_DIR
  passkey                        # under data/
  …

$BROS_DATA_DIR/             # default $BROS_DIR/data
  passkey
  proxy-key
  session-secret
  bros.sqlite
  config/
    assistant.md
    skills/                      # personality, rules (Settings)
    enabled-apps                 # addon package ids, one per line
    apps/<id>/config.yml         # custom apps only. → /opt/bros/apps. Scripts sit beside it.
    apps/applied.json            # install record, same mount
  skills-internal/               # label, task, tasks; not mounted
  home/                          # Desktop $HOME. Docker apps mount only listed subdirs.
    .local/app-bins/         # app launch.sh wrappers, on Desktop PATH
    workspace/                   # $HOME/workspace unless workspace or BROS_WORKSPACE overrides
    .agents/skills/
    .ollama/                     # downloaded models (blobs, manifests)
    .config/ollama/
    .cursor/
    .config/cursor/
    .config/Cursor/
    .local/share/cursor-agent/
    .config/opencode/
    .local/share/opencode/
    .local/state/opencode/
    .pi/
    .cache/huggingface/          # OpenJEV. Whisper mounts hub/ inside this tree
    .cache/vllm/
    .cache/flashinfer/
    .npm/
    .local/                      # npm prefix
    .local/share/pnpm/
    .bun/
  apps/
    ollama/bros-model/           # → /bros-model (read-only). Not the downloaded models.
    openwebui/data/              # → /app/backend/data
    firecrawl/redis/             # → /data
    firecrawl/rabbitmq/          # → /var/lib/rabbitmq (root)
    firecrawl/postgres/          # → /var/lib/postgresql/data (root)
  var/
    tunnel/                      # status, logs, enabled, config.yml
    logs/                        # container stdout/stderr, `<service>.log`
```

Docker apps stay stopped until SQLite `autostart` is on or the id is listed in `BROS_APPS_ENABLED`. A fresh install does not start addons. Turn Autostart on and restart Bros, set `BROS_APPS_ENABLED=openwebui,firecrawl`, or press Start. Ollama always starts and has no Restart. Whisper follows Settings **Enable Whisper** (off by default). The Bros container is not a docker app.

Passkey (login passcode) lives in `passkey` — printed at app startup. Providers (Ollama `config.customModels`, Popular services keys/models, custom OpenAI `config.models`), chat, Settings `enable_host_ollama` (host Ollama row, default off), Settings `enable_whisper` (Whisper docker app, default off), and docker app autostart/nav pins/`host_mode`/`expose_host`/`host_probe_port` (manual host-Ollama override) are stored in SQLite. Built-in providers are `ollama` (docker app), `ollama-host` (row always seeded; listed only when `enable_host_ollama` is on), and the 14 Popular services rows.

On a source checkout, `$BROS_DATA_DIR/apps/ollama/bros-model` is a copy of the packaged specialist tree from submodule `vendor/bros-model` ([jasenmichael/bros-model](https://github.com/jasenmichael/bros-model)). A release does not ship that tree. An existing copy under `data/` stays across `bros update`.

Do not commit `data/`, `.env` (optional overrides only; defaults need no `.env`), `.nuxt`, or `node_modules`. See [Environment](/docs/environment.md) and repo-root `example.env`.
