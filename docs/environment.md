---
title: Environment
description: BROS_* catalog, YAML vs env vs SQLite.
---

# Environment

Bros uses the `BROS_*` prefix. YAML holds `working_dir`, `data_dir`, and optional `public_url`. Env can override those. Everything else (providers, keys, chat, sidecar pins) lives in SQLite and the UI. There is **no** `OPENAI_API_KEY` env bootstrap — paste keys on Models.

## Host (CLI / install)

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_HOME` | checkout next to `docker-compose.yml`, else `~/.bros` | Repo / install dir |
| `BROS_DIR` | alias of `BROS_HOME` | Same |
| `BROS_CONFIG` | `~/.config/bros.yml` | Bootstrap YAML |
| `BROS_BIN` | `~/.local/bin/bros` | PATH symlink |
| `BROS_HOST_DATA_DIR` | `$BROS_HOME/data` | Persistent binds |
| `BROS_PORT` | `3055` | App host port (tunnel helper targets this) |
| `BROS_DEV` | unset | `1` selects bind-mount compose (`pnpm dev`) |
| `BROS_REPO` | `https://github.com/jasenmichael/bros.git` | `install.sh` clone URL |
| `BROS_REF` | `main` | `install.sh` git ref |
| `BROS_PUBLIC_URL` | unset | Named tunnel hostname (overrides YAML) |
| `BROS_TUNNEL_DIR` | `$BROS_HOME/data/tunnel` | Host helper files |
| `BROS_TUNNEL_NAME` | `bros` | Named Cloudflare tunnel name |
| `BROS_TUNNEL_ROUTE_TIMEOUT` | `20` | Seconds for `cloudflared tunnel route dns` |
| `BROS_HOST_GATEWAY` | `host.docker.internal` | Host probe from the app container |
| `BROS_HOST_UID` / `BROS_HOST_GID` | current user | Compose `user:` so binds are not root-owned |
| `BROS_DOCKER_GID` | docker group GID, else `0` | `group_add` for `/var/run/docker.sock` |
| `BROS_HOST_HOME_BIND` | `$HOME` | Mounted at `/host-home` in the app container |

## In-container (Compose)

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_WORKING_DIR` | `/app` | App root inside the container |
| `BROS_DATA_DIR` | `/data` | SQLite, custom sidecars, logs |
| `BROS_SIDECARS_DIR` | `/app/sidecars` | Core sidecar packages |
| `BROS_NETWORK` | `bros` | Shared external Docker network (CLI/dockerode create if missing) |
| `BROS_OLLAMA_PORT` | `11435` | Host publish for sidecar Ollama |
| `BROS_OPENCODE_PORT` | `4097` | Host publish for OpenCode |
| `BROS_OPENWEBUI_PORT` | `3080` | Host publish for Open WebUI |
| `BROS_TUNNEL_PROTOCOL` | `http2` | `cloudflared` protocol (`http2` / `quic` / `auto`) |
| `BROS_TUNNEL_EDGE_IP_VERSION` | `4` | `4` / `6` / `auto` |
| `BROS_TUNNEL_HOST` | unset | Extra Host match for via-tunnel detection |

YAML vs env vs SQLite: [Configuration](/docs/configuration).
