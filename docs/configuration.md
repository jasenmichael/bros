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

Persistent binds live under `$BROS_HOME/data` (`BROS_HOST_DATA_DIR`):

- `$BROS_HOST_DATA_DIR` → app `/data` (SQLite, logs, tunnel). Each sidecar’s runtime data is `$BROS_HOST_DATA_DIR/<id>/` with subpaths that mirror container paths.
- `$BROS_HOST_DATA_DIR/ollama/root/.ollama` → Ollama `/root/.ollama`
- `$BROS_HOST_DATA_DIR/ollama/bros-model` → Ollama `/bros-model` (packaged specialist, read-only)
- `$BROS_HOST_DATA_DIR/openwebui/app/backend/data` → Open WebUI data
- `$BROS_HOST_DATA_DIR/opencode/workspace` → OpenCode workspace
- `$BROS_HOST_DATA_DIR/firecrawl/var/lib/postgresql/data` → Firecrawl Postgres
- `$BROS_HOST_DATA_DIR/firecrawl/data` → Firecrawl Redis
- `$BROS_HOST_DATA_DIR/firecrawl/var/lib/rabbitmq` → Firecrawl RabbitMQ
- `$BROS_HOST_DATA_DIR/whisper/home/ubuntu/.cache/huggingface/hub` → Whisper Hugging Face cache
- `$BROS_HOST_DATA_DIR/openjev/root/.cache/huggingface` → OpenJEV Hugging Face cache
- `$BROS_HOST_DATA_DIR/openjev/root/.cache/vllm` → OpenJEV vLLM cache
- `$BROS_HOST_DATA_DIR/openjev/root/.cache/flashinfer` → OpenJEV FlashInfer cache

The image sets `BROS_DIR=/app`, so in-container data is `/app/data` (`$BROS_DIR/data`). Start does not copy leftover named volumes into those dirs.

## Data directory layout

```text
$BROS_HOME/sidecars/
  core/                # ollama, whisper
  addon/               # opencode, openwebui, firecrawl, firecrawl-ui, openjev
  custom/              # gitignored; Add sidecar and git clones

$BROS_HOST_DATA_DIR/
  passkey
  bros.sqlite
  logs/
  tunnel/
  ollama/root/.ollama/
  ollama/root/.config/ollama/
  ollama/bros-model/
  openwebui/app/backend/data/
  opencode/workspace/
  firecrawl/data/
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
