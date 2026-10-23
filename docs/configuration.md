---
title: Configuration
description: bros.yml in the data config dir, and host data binds.
---

# Configuration

## Bootstrap YAML

The app loads `$BROS_HOST_DATA_DIR/config/bros.yml` only. It does not read `~/.config/bros.yml`. A leftover `$BROS_DIR/bros.yml` is renamed there on startup when the new file is missing.

```yaml
public_url: https://bros.example.com
enable_host_ollama: false
enable_whisper: false
```

`public_url` enables the host Cloudflare tunnel and is the advertised hostname. `enable_host_ollama` and `enable_whisper` default off. Chat prepend and assistant description are the `rules` and `personality` skill files. Provider API keys stay in SQLite (no `OPENAI_API_KEY` env). Passkey and session secret are files under the data dir.

Full `BROS_*` list: [Environment](/docs/environment). Tunnel: [Tunnel](/docs/tunnel).

## `BROS_HOME` and host binds

When running `bros` with `BROS_DIR` unset, `BROS_DIR` is the real directory of the `bros` script (symlink-aware: `~/.local/bin/bros` → `$BROS_DIR/bros`). An installed clone is typically `~/.bros`. `BROS_HOME` is an alias. Later `install.sh` will clone to `~/.bros` and symlink `BROS_BIN` (`~/.local/bin/bros`) to `$BROS_DIR/bros`. The current installer still writes `~/.config/bros.yml`; the app does not read that file.

Persistent binds live under `$BROS_HOME/data` (`BROS_HOST_DATA_DIR`). The image sets `BROS_DIR=/app`, so that directory is `/app/data` inside the container. Start does not copy leftover named volumes into those dirs.

Shipped packs are `lib/sidecars/core` and `lib/sidecars/addon`. Custom packs are `lib/sidecars/custom`. Only `README.md` in that directory is tracked. A custom pack can later move to `lib/sidecars/addon/` or `lib/sidecars/core/`. An addon can later move to core. Production mounts core and addon read-only at `/app/sidecars/core` and `/app/sidecars/addon`, and custom writable at `/app/sidecars/custom`. Dev does not mount those paths; discovery uses `/app/lib/sidecars`.

## Directory layout

```text
$BROS_DIR/lib/sidecars/
  core/                          # ollama, whisper, desktop
  addon/                         # opencode, openwebui, firecrawl, firecrawl-ui, openjev, pi, omniroute, cursor
  custom/                        # user packs; only README.md is tracked
    <id>/                        # Add sidecar
    <name>/sidecars/             # git clone

$BROS_HOST_DATA_DIR/             # default $BROS_HOME/data
  passkey
  proxy-key
  session-secret
  bros.sqlite
  config/
    bros.yml
    assistant.md
    skills/                      # personality, rules (Settings)
    apps/<id>/config.yml         # → /opt/bros/apps. Scripts sit beside it.
    apps/applied.json            # install record, same mount
  skills-internal/               # label, task, tasks; not mounted
  home/                          # Desktop $HOME. Sidecars mount only listed subdirs.
    .local/sidecar-bins/         # sidecar CLI wrappers, on Desktop PATH
    workspace/                   # $HOME/workspace unless workspace or BROS_HOST_WORKSPACE overrides
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
  sidecars/
    ollama/bros-model/           # → /bros-model (read-only). Not the downloaded models.
    openwebui/data/              # → /app/backend/data
    firecrawl/redis/             # → /data
    firecrawl/rabbitmq/          # → /var/lib/rabbitmq (root)
    firecrawl/postgres/          # → /var/lib/postgresql/data (root)
  var/
    tunnel/                      # status, logs, enabled, config.yml
    logs/                        # container stdout/stderr, `<service>.log`
```

Addon and custom sidecars stay stopped until SQLite `autostart` is on. A fresh install does not start them. Turn Autostart on and restart Bros, or press Start. The app compose file defaults `BROS_SIDECAR_OPENCODE` to `0`, so the OpenCode sidecar is env-disabled, stays listed, and does not start. Env can still mark a shipped addon disabled: `BROS_SIDECAR_OPENCODE=0`, `BROS_SIDECAR_OPENWEBUI=0`, `BROS_SIDECAR_FIRECRAWL=0`, `BROS_SIDECAR_FIRECRAWL_UI=0`, `BROS_SIDECAR_OPENJEV=0`, `BROS_SIDECAR_PI=0`, `BROS_SIDECAR_OMNIROUTE=0`, or `BROS_SIDECARS_DISABLE=opencode,openwebui,firecrawl,firecrawl-ui,openjev,pi,omniroute`. Ollama always starts and has no Restart. Desktop always starts. Whisper is core and follows Settings **Enable Whisper** (off by default), not those env vars.

Passkey (login passcode) lives in `passkey` — printed at app startup. Providers (Ollama `config.customModels`, Popular services keys/models, custom OpenAI `config.models`), chat, Settings `enable_host_ollama` (host Ollama row, default off), Settings `enable_whisper` (Whisper sidecar, default off), and sidecar autostart/nav pins/`host_mode`/`expose_host`/`host_probe_port` (manual host-Ollama override) are stored in SQLite. Built-in providers are `ollama` (sidecar), `ollama-host` (row always seeded; listed only when `enable_host_ollama` is on), and the 12 Popular services rows.

`$BROS_HOST_DATA_DIR/sidecars/ollama/bros-model` is a copy of the packaged specialist tree from submodule `vendor/bros-model` ([jasenmichael/bros-model](https://github.com/jasenmichael/bros-model)).

Do not commit `data/`, `.env` (optional overrides only; defaults need no `.env`), `.nuxt`, or `node_modules`. See [Environment](/docs/environment) and repo-root `example.env`.
