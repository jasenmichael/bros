---
title: Environment
description: Vars a user can set in .env, with defaults.
---

# Environment

No `.env` is needed. `./bros` and Compose apply the defaults below when a var is unset. Repo-root `example.env` lists each one commented, default after `=`, short note after that. To override, `cp example.env .env`, uncomment the line, and delete the trailing comment. `./bros` keeps that comment as part of the value. A var already set in the shell wins. Empty values are skipped. A local `.env` is gitignored.

Server settings live in `$BROS_HOME/data/config/bros.yml`. Chat prepend and assistant description are the `rules` and `personality` skill files. Provider keys and chat history live in SQLite. There is no Providers key bootstrap. Paste those keys on Providers. Pi and OpenJEV can read the empty key names below when set.

`BROS_DIR` inside the container stays `/app`.

## Host

`BROS_DIR` and `BROS_HOME` default to the realpath of the `bros` script. `BROS_HOME` alone aliases. `install.sh` uses `~/.bros`.

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_DIR` | script directory | App directory |
| `BROS_HOME` | same as `BROS_DIR` | Alias |
| `BROS_BIN` | `$HOME/.local/bin/bros` | Symlink to `$BROS_DIR/bros` |
| `BROS_HOST_DATA_DIR` | `$BROS_HOME/data` | Persistent binds |
| `BROS_HOST_WORKSPACE` | `$BROS_HOST_DATA_DIR/home/workspace` | Desktop workspace bind |
| `BROS_HOST_REPO` | directory of the `bros` script | Desktop image context and Desktop `/app` bind |
| `BROS_HOST_HOME_BIND` | `$HOME` | Host home bind |
| `BROS_PORT` | `3055` | App port |
| `BROS_HOST` | `0.0.0.0` | Listen address. `127.0.0.1` stays on this machine |
| `BROS_DEV` | `0` | `1` selects `docker-compose.dev.yml`. Same as `./bros --dev` |
| `BROS_DEVBOX_VERSION` | `0.18.4` | Desktop Devbox binary pin. A change applies on the next Desktop image build |

## User

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_HOST_UID` | `id -u` | Compose user on the app and sidecars |
| `BROS_HOST_GID` | `id -g` | Compose group on the app and sidecars |
| `BROS_HOST_GATEWAY` | `host.docker.internal` | Host probe from the app container |
| `BROS_NETWORK` | `bros` | Docker network. `./bros` creates it when missing |

## Sidecars

Unset does not start an addon. `0`, `false`, `off`, or `no` skips it. Autostart is SQLite and defaults off. Ollama, Desktop, and Whisper ignore these.

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_SIDECARS_DISABLE` | empty | Comma list of addon ids |
| `BROS_SIDECAR_OPENCODE` | `0` | Env-disable the OpenCode sidecar. The pack stays listed and does not start. `1` allows Start and Autostart. The app compose file supplies `0` when this is unset |
| `BROS_SIDECAR_OPENWEBUI` | unset | Skip Open WebUI |
| `BROS_SIDECAR_FIRECRAWL` | unset | Skip Firecrawl |
| `BROS_SIDECAR_FIRECRAWL_UI` | unset | Skip Firecrawl UI (`firecrawl-ui`) |
| `BROS_SIDECAR_OPENJEV` | unset | Skip OpenJEV |
| `BROS_SIDECAR_PI` | unset | Skip Pi |
| `BROS_SIDECAR_OMNIROUTE` | unset | Skip OmniRoute |

## Host ports

In-container Bros uses Docker DNS, not these.

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_OLLAMA_PORT` | `11435` | Sidecar Ollama |
| `BROS_OPENCODE_PORT` | `4097` | OpenCode |
| `BROS_OPENWEBUI_PORT` | `3080` | Open WebUI |
| `BROS_FIRECRAWL_PORT` | `3002` | Firecrawl API |
| `BROS_FIRECRAWL_UI_PORT` | `3081` | Firecrawl UI |
| `BROS_WHISPER_PORT` | `8090` | Whisper |
| `BROS_OPENJEV_PORT` | `8092` | OpenJEV |
| `BROS_OMNIROUTE_PORT` | `20128` | OmniRoute dashboard and `/v1` |

## Firecrawl

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_FIRECRAWL_POSTGRES_PASSWORD` | `bros-firecrawl-local-trusted-network-only-32b` | Local Postgres only |
| `POSTGRES_USER` | `postgres` | Firecrawl Postgres user |
| `POSTGRES_DB` | `postgres` | Firecrawl Postgres database |
| `NUM_WORKERS_PER_QUEUE` | `8` | Workers per queue |
| `CRAWL_CONCURRENT_REQUESTS` | `10` | Concurrent requests |
| `MAX_CONCURRENT_JOBS` | `5` | Concurrent jobs |
| `BROWSER_POOL_SIZE` | `5` | Browser pool |
| `HARNESS_STARTUP_TIMEOUT_MS` | `60000` | Harness startup |

## OpenJEV

| Variable | Default | Role |
| --- | --- | --- |
| `OPENJEV_GPU_UTIL` | `0.80` | GPU memory fraction |
| `OPENJEV_VLLM_ARGS` | `--kv-cache-dtype bfloat16` | vLLM args |
| `OPENJEV_DEVICE` | `cpu` | Encoder device. `cuda` when VRAM allows |
| `OPENJEV_MAX_NUM_SEQS` | `64` | Max sequences |
| `OPENJEV_MAX_MODEL_LEN` | `65536` | Max model length |
| `OPENJEV_MODEL_ROUTES` | `laya-1.0=http://laya:8080,verdict-1.4=http://verdict:8080` | Encoder routes |

## Sidecar keys

Empty. Not a Providers bootstrap. Do not commit a real value.

| Variable | Default | Role |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | empty | Pi |
| `OPENAI_API_KEY` | empty | Pi |
| `GEMINI_API_KEY` | empty | Pi |
| `OPENJEV_API_KEY` | empty | OpenJEV |
| `OPENJEV_ORIGIN_SECRET` | empty | OpenJEV |
| `HF_TOKEN` | empty | OpenJEV Hugging Face |

## Tunnel

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_PUBLIC_URL` | empty | Wins over `BROS_TUNNEL_HOST` and YAML `public_url` |
| `BROS_TUNNEL_HOST` | empty | Hostname when `public_url` is unset. Also a via-tunnel Host match |
| `BROS_TUNNEL_DIR` | `$BROS_HOST_DATA_DIR/var/tunnel` | Helper files |
| `BROS_TUNNEL_NAME` | `bros` | Named tunnel |
| `BROS_TUNNEL_ROUTE_TIMEOUT` | `20` | Seconds for `cloudflared tunnel route dns` |
| `BROS_TUNNEL_PROTOCOL` | `http2` | `http2`, `quic`, or `auto` |
| `BROS_TUNNEL_EDGE_IP_VERSION` | `4` | `4`, `6`, or `auto` |

`install.sh` reads `BROS_REPO`, `BROS_REF`, and `BROS_CONFIG` from the shell, not from `.env`. See [Install](/docs/install). YAML vs env vs SQLite: [Configuration](/docs/configuration).
