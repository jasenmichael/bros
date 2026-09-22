---
title: Configuration
description: Bootstrap YAML, BROS_HOME, and host data binds.
---

# Configuration

## Bootstrap YAML

`working_dir`, `data_dir`, and optional `public_url` belong in YAML. Load order:

1. `BROS_CONFIG` exclusive file (install default `~/.config/bros.yml`), or
2. `~/.config/bros.yml` (install default), else checkout `.config/bros.yml` then `./bros.yml`
3. Env: `BROS_WORKING_DIR`, `BROS_DATA_DIR`, `BROS_PUBLIC_URL`

```yaml
working_dir: .
data_dir: ./data
public_url: https://bros.example.com
```

`public_url` enables the host Cloudflare tunnel and is the advertised hostname. All other settings live in SQLite (`bros.sqlite`) and the UI. YAML does not bootstrap provider API keys (no `OPENAI_API_KEY`).

Full `BROS_*` list: [Environment](/docs/environment). Tunnel: [Tunnel](/docs/tunnel).

## `BROS_HOME` and host binds

`BROS_HOME` is the repo checkout when the CLI sits next to `docker-compose.yml` + `sidecars/`. An installed clone is `~/.bros`. `BROS_DIR` is an alias. Override with `BROS_HOME` or `BROS_DIR`. Host bootstrap YAML defaults to `~/.config/bros.yml` (`BROS_CONFIG`). The user-facing command is `~/.local/bin/bros` (`BROS_BIN`).

Persistent binds live under `$BROS_HOME/data` (`BROS_HOST_DATA_DIR`):

- `$BROS_HOST_DATA_DIR` → app `/data` (SQLite, additional sidecars, sidecar-repos, logs)
- `$BROS_HOST_DATA_DIR/ollama` → Ollama sidecar `/root/.ollama`
- `$BROS_HOST_DATA_DIR/bros-model` → Ollama sidecar `/bros-model` (packaged specialist, read-only)
- `$BROS_HOST_DATA_DIR/openwebui` → Open WebUI data
- `$BROS_HOST_DATA_DIR/opencode` → OpenCode workspace
- `$BROS_HOST_DATA_DIR/firecrawl-pg` → Firecrawl Postgres
- `$BROS_HOST_DATA_DIR/firecrawl-redis` → Firecrawl Redis
- `$BROS_HOST_DATA_DIR/firecrawl-rabbitmq` → Firecrawl RabbitMQ

In-container `BROS_DATA_DIR` stays `/data`. Start does not copy leftover named volumes into those dirs.

## Data directory layout

```text
$BROS_HOST_DATA_DIR/
  passkey
  bros.sqlite
  sidecars/            # additional (user-created)
  sidecar-repos/       # cloned git trees; each tree’s sidecars/ is loaded
  logs/
  tunnel/
  ollama/
  bros-model/
  openwebui/
  opencode/
  firecrawl-pg/
  firecrawl-redis/
  firecrawl-rabbitmq/
```

Shipped addons autostart unless disabled: `BROS_SIDECAR_OPENCODE=0`, `BROS_SIDECAR_OPENWEBUI=0`, `BROS_SIDECAR_FIRECRAWL=0`, `BROS_SIDECAR_FIRECRAWL_UI=0`, `BROS_SIDECAR_WHISPER=0`, or `BROS_SIDECARS_DISABLE=opencode,openwebui,firecrawl,firecrawl-ui,whisper`. Ollama has no disable env.

Passkey (login passcode) lives in `passkey` — printed at app startup. Providers (Ollama `config.customModels`, Popular services keys/models, custom OpenAI `config.models`), chat, Settings `enable_host_ollama` (host Ollama row, default off), and sidecar autostart/nav pins/`host_probe_port` (manual host-Ollama override) are stored in SQLite. Built-in providers are `ollama` (sidecar), `ollama-host` (row always seeded; listed only when `enable_host_ollama` is on), and the 12 Popular services rows.

`$BROS_HOST_DATA_DIR/bros-model` is a copy of the packaged specialist tree from submodule `vendor/bros-model` ([jasenmichael/bros-model](https://github.com/jasenmichael/bros-model)).

Do not commit `data/`, `.env`, `.nuxt`, or `node_modules`.
