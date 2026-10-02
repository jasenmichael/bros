---
title: Configuration
description: One bros.yml in BROS_DIR, and host data binds.
---

# Configuration

## Bootstrap YAML

The app loads `$BROS_DIR/bros.yml` only. It does not read `~/.config/bros.yml`. The host tunnel helper still prefers `~/.config/bros.yml` when that file exists, then `$BROS_DIR/bros.yml`.

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

Shipped packs are in the repo at `lib/sidecars/`, not under the data dir. User packs are `$BROS_SIDECARS_DIR` (default `$BROS_DIR/sidecars`) and are gitignored. The repo does not ship them. A custom pack can later move to `lib/sidecars/addon/` or `lib/sidecars/core/`. An addon can later move to core. Production mounts the three trees as `/app/sidecars/core`, `/app/sidecars/addon`, and `/app/sidecars/custom`. Dev does not mount those three paths; discovery uses `/app/lib/sidecars` and `/app/sidecars`.

## Directory layout

```text
$BROS_DIR/lib/sidecars/          # shipped packs
  core/                          # ollama, whisper
  addon/                         # opencode, openwebui, firecrawl, firecrawl-ui, openjev

$BROS_SIDECARS_DIR/              # default $BROS_DIR/sidecars; gitignored
  <id>/                          # Add sidecar
  <name>/sidecars/               # git clone

$BROS_HOST_DATA_DIR/             # default $BROS_HOME/data
  passkey
  proxy-key
  session-secret
  bros.sqlite
  logs/
  tunnel/
  rules/assistant.md
  skills/
  skills-internal/
  ollama/root/.ollama/           # → /root/.ollama
  ollama/root/.config/ollama/    # → /root/.config/ollama
  ollama/bros-model/             # → /bros-model (read-only)
  openwebui/app/backend/data/    # → /app/backend/data
  opencode/workspace/            # → /workspace
  opencode/root/.config/opencode/
  opencode/root/.local/share/opencode/
  firecrawl/data/                # Redis → /data
  firecrawl/var/lib/rabbitmq/
  firecrawl/var/lib/postgresql/data/
  whisper/home/ubuntu/.cache/huggingface/hub/
  openjev/root/.cache/huggingface/
  openjev/root/.cache/vllm/
  openjev/root/.cache/flashinfer/
```

Shipped addons autostart unless disabled: `BROS_SIDECAR_OPENCODE=0`, `BROS_SIDECAR_OPENWEBUI=0`, `BROS_SIDECAR_FIRECRAWL=0`, `BROS_SIDECAR_FIRECRAWL_UI=0`, `BROS_SIDECAR_OPENJEV=0`, or `BROS_SIDECARS_DISABLE=opencode,openwebui,firecrawl,firecrawl-ui,openjev`. Ollama has no disable env. Whisper is core and follows Settings **Enable Whisper** (off by default), not those env vars.

Passkey (login passcode) lives in `passkey` — printed at app startup. Providers (Ollama `config.customModels`, Popular services keys/models, custom OpenAI `config.models`), chat, Settings `enable_host_ollama` (host Ollama row, default off), Settings `enable_whisper` (Whisper sidecar, default off), and sidecar autostart/nav pins/`host_probe_port` (manual host-Ollama override) are stored in SQLite. Built-in providers are `ollama` (sidecar), `ollama-host` (row always seeded; listed only when `enable_host_ollama` is on), and the 12 Popular services rows.

`$BROS_HOST_DATA_DIR/ollama/bros-model` is a copy of the packaged specialist tree from submodule `vendor/bros-model` ([jasenmichael/bros-model](https://github.com/jasenmichael/bros-model)).

Do not commit `data/`, `.env` (optional overrides only; defaults need no `.env`), `.nuxt`, or `node_modules`. See [Environment](/docs/environment) and repo-root `example.env`.
