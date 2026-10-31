---
title: Environment
description: Vars a user can set in .env, with defaults.
---

# Environment

No `.env` is needed for defaults. `./bros` and Compose apply the defaults below when a var is unset. Repo-root `example.env` lists each one commented, default after `=`, short note after that. Install copies `example.env` to `.env` when `.env` is absent and leaves `example.env` in place. To override, uncomment the line in `.env`. A same-line ` # comment` is ignored. `$HOME`, `${HOME}`, and a leading `~` expand from the process environment. `$BROS_HOME` / `${BROS_HOME}` expand when resolving `BROS_HOST_DATA_DIR`. After expand, `BROS_HOST_DATA_DIR` (and a set `BROS_HOST_WORKSPACE`) must be absolute and must not contain `$` or `#` — otherwise the CLI exits before Compose can create junk under `BROS_HOME` (for example a literal `$HOME` directory). A var already set in the shell wins. Empty values are skipped. A local `.env` is gitignored. `bros update` refreshes `example.env` and does not replace an existing `.env`.

Server settings live in `$BROS_HOME/bros.yml`. Chat prepend and assistant description are the `rules` and `personality` skill files. Provider keys and chat history live in SQLite. There is no Providers key bootstrap. Paste those keys on Providers. Pi and OpenJEV can read the empty key names below when set.

`BROS_DIR` inside the container stays `/app`.

## Host

`BROS_DIR` and `BROS_HOME` default to the realpath of the `bros` script. `BROS_HOME` alone aliases. `install.sh` uses `~/.bros`.

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_DIR` | script directory | App directory |
| `BROS_HOME` | same as `BROS_DIR` | Alias |
| `BROS_BIN` | `$HOME/.local/bin/bros` | Symlink to `$BROS_DIR/bros` |
| `BROS_HOST_DATA_DIR` | `$BROS_HOME/data` | Persistent binds. On the host, the CLI also sets `BROS_DATA_DIR` to this path so the UI and Bearer `proxy-key` share one tree |
| `BROS_DATA_DIR` | `$BROS_DIR/data` (UI); aligned to `BROS_HOST_DATA_DIR` by the host CLI | App data the UI process opens (SQLite, `proxy-key`). In-container stays `/app/data` |
| `BROS_HOST_WORKSPACE` | `bros.yml` `workspace` when that path is a host path, else `$BROS_HOST_DATA_DIR/home/workspace` | Desktop workspace bind. A set value wins. Not exported when the data dir is empty, `/app/data`, or `/data` |
| `BROS_HOST_REPO` | directory of the `bros` script | Repo bind and image build context |
| `BROS_HOST_HOME_BIND` | `$HOME` | Host home bind |
| `BROS_PORT` | `3055` | UI host port |
| `BROS_HOST` | `0.0.0.0` | UI listen address. `127.0.0.1` stays on this machine |
| `BROS_STREAM_PORT` | `3300` | Selkies host port, bound to `127.0.0.1` |
| `BROS_TTYD_PORT` | `7681` | ttyd host port, bound to `127.0.0.1` |
| `BROS_DESKTOP_STREAM_ORIGIN` | `http://127.0.0.1:$BROS_STREAM_PORT` on the host UI, `http://bros:3000` in `bros-ui` | `/desktop/view/` proxy target |
| `BROS_TERMINAL_ORIGIN` | `http://127.0.0.1:$BROS_TTYD_PORT` on the host UI, `http://bros:7681` in `bros-ui` | `/terminal/session` proxy target |
| `BROS_DEV` | `0` | `1` selects `lib/desktop/docker-compose.dev.yml`. Same as `./bros --dev`. Dev requires host pnpm and cargo |
| `BROS_USE_RUNNER` | `0` | `1` starts container `bros-ui` even when host `pnpm` is on `PATH`. Same as `./bros --use-runner`. Dev with `1` errors |
| `BROS_NODE_VERSION` | `node -v` where `./bros` runs, else `26.7.0` | Desktop Node pin. Ensure installs `nodejs@` that version. Check offers an update only when the installed Node is missing or lower |

## User

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_HOST_UID` | `id -u` | Compose user on the app and docker apps |
| `BROS_HOST_GID` | `id -g` | Compose group on the app and docker apps |
| `BROS_HOST_GATEWAY` | `host.docker.internal` | Host probe from the app container |
| `BROS_NETWORK` | `bros` | Docker network. `./bros` creates it when missing |

## Docker apps (env names keep `BROS_APP_*`)

Unset does not start an addon. `0`, `false`, `off`, or `no` marks that shipped addon disabled in discovery. It stays listed, does not autostart, and still reserves its id or slug. Autostart is SQLite and defaults off; boot honors it for non-core docker apps. Ollama, Desktop, and Whisper ignore these.

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_APPS_DISABLE` | empty | Comma list of addon ids |
| `BROS_APP_OPENCODE` | unset | Env-disable a docker app whose id is `opencode`. No shipped OpenCode docker app |
| `BROS_APP_OPENWEBUI` | unset | Skip Open WebUI |
| `BROS_APP_FIRECRAWL` | unset | Skip Firecrawl |
| `BROS_APP_FIRECRAWL_UI` | unset | Skip Firecrawl UI (`firecrawl-ui`) |
| `BROS_APP_OPENJEV` | unset | Skip OpenJEV |
| `BROS_APP_PI` | unset | Skip Pi |
| `BROS_APP_OMNIROUTE` | unset | Skip OmniRoute |

## Host ports

In-container Bros uses Docker DNS, not these.

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_OLLAMA_PORT` | `11435` | Docker app Ollama |
| `BROS_OPENCODE_PORT` | `4096` | OpenCode |
| `BROS_OPENWEBUI_PORT` | `3080` | Open WebUI |
| `BROS_FIRECRAWL_PORT` | `3002` | Firecrawl API |
| `BROS_FIRECRAWL_UI_PORT` | `3081` | Firecrawl UI |
| `BROS_WHISPER_PORT` | `8090` | Whisper |
| `BROS_OPENJEV_PORT` | `8092` | OpenJEV |
| `BROS_OMNIROUTE_PORT` | `20128` | OmniRoute dashboard and `/v1` |
| `OMNIROUTE_JWT_SECRET` | unset | OmniRoute dashboard JWT. Else `$BROS_HOST_DATA_DIR/apps/omniroute/.env`. Never a pack-dir `.env` |

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

## Docker app keys

Empty. Not a Providers bootstrap. Do not commit a real value.

| Variable | Default | Role |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | empty | Pi |
| `OPENAI_API_KEY` | empty | Pi |
| `GEMINI_API_KEY` | empty | Pi |
| `OPENJEV_API_KEY` | empty | OpenJEV |
| `OPENJEV_ORIGIN_SECRET` | empty | OpenJEV |
| `HF_TOKEN` | empty | OpenJEV Hugging Face |
| `GH_TOKEN` | empty | Agents page GitHub token. On start, replaces the stored token when set. Else `GITHUB_TOKEN`, else `GITHUB_PAT`. Unset leaves a pasted token |

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
