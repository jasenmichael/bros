---
title: Environment
description: BROS_* catalog, YAML vs env vs SQLite.
---

# Environment

Bros uses the `BROS_*` prefix. Server settings live in `$BROS_DIR/bros.yml`. Chat prepend and assistant description are the `rules` and `personality` skill files. Provider keys and chat history live in SQLite. **No `.env` is needed** — Bros and Compose apply the defaults below when vars are unset. Repo-root `example.env` lists those defaults commented out; to override, `cp example.env .env`, uncomment the lines you want, and change the values. A local `.env` is gitignored. Compose reads a repo-root `.env` only for `${...}` substitution when that file exists. There is **no** `OPENAI_API_KEY` env bootstrap — paste keys on Providers.

## Host (CLI / install)

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_DIR` | directory of the `bros` script (symlink-resolved) | App dir. Holds `bros.yml`. Set when running `bros` if unset. |
| `BROS_HOME` | alias of `BROS_DIR` | Same |
| `BROS_BIN` | `~/.local/bin/bros` | Symlink to `$BROS_DIR/bros` (install sets this later) |
| `BROS_HOST_DATA_DIR` | `$BROS_HOME/data` | Persistent binds |
| `BROS_PORT` | `3055` | App port. Tunnel helper, health check, and status use this with `BROS_HOST`. |
| `BROS_HOST` | `127.0.0.1` | Address on the host machine. The container process binds `0.0.0.0` so a published port reaches it. |
| `BROS_DEV` | unset | `1` selects bind-mount compose (`BROS_DEV=1 ./bros`) |
| `BROS_REPO` | `https://github.com/jasenmichael/bros.git` | `install.sh` clone URL |
| `BROS_REF` | `main` | `install.sh` git ref |
| `BROS_PUBLIC_URL` | unset | Named tunnel hostname (overrides YAML) |
| `BROS_TUNNEL_DIR` | `$BROS_HOME/data/tunnel` | Host helper files |
| `BROS_TUNNEL_NAME` | `bros` | Named Cloudflare tunnel name |
| `BROS_TUNNEL_ROUTE_TIMEOUT` | `20` | Seconds for `cloudflared tunnel route dns` |
| `BROS_HOST_GATEWAY` | `host.docker.internal` | Host probe from the app container |
| `BROS_HOST_UID` / `BROS_HOST_GID` | current user | Compose `user:` so binds are not root-owned |
| `BROS_DOCKER_GID` | docker group GID, else `0` | `group_add` for `/var/run/docker.sock` |
| `BROS_SIDECARS_DIR` | `$BROS_DIR/sidecars` | Host directory for user sidecar packs. Gitignored. The repo does not ship packs here. A custom pack can later move to `lib/sidecars/addon/` or `lib/sidecars/core/`. Inside the **production** app container this is `/app/sidecars/custom`. With `BROS_DEV=1` (`./:/app` bind), packs are visible at `/app/sidecars` and compose sets `BROS_SIDECARS_DIR` to that path. |

## In-container (Compose)

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_DIR` | `/app` | Image constant. Data defaults to `$BROS_DIR/data` (`/app/data`). Production mounts shipped sidecars at `/app/sidecars/core` and `/app/sidecars/addon`, and user packs at `/app/sidecars/custom`. Dev does not mount `/app/sidecars/{core,addon,custom}` (those mounts are production-only); discovery uses `/app/lib/sidecars` and `/app/sidecars`. |
| `BROS_PORT` | `3055` | Published host port and the port inside the container. |
| `BROS_HOST` | `127.0.0.1` | Host address passed into the container. The process still binds `0.0.0.0`. |
| `BROS_SIDECARS_DIR` | `/app/sidecars/custom` (prod) / `/app/sidecars` (dev) | In-container path for user sidecar packs. |
| `BROS_SIDECARS_DISABLE` | unset | Comma list of shipped addon ids to skip at autostart (`opencode,openwebui,firecrawl,firecrawl-ui,openjev`). Does not disable `ollama` or `whisper`. |
| `BROS_SIDECAR_OPENCODE` | unset | `0` / `false` / `off` skips OpenCode autostart |
| `BROS_SIDECAR_OPENWEBUI` | unset | `0` / `false` / `off` skips Open WebUI autostart |
| `BROS_SIDECAR_FIRECRAWL` | unset | `0` / `false` / `off` skips Firecrawl autostart |
| `BROS_SIDECAR_FIRECRAWL_UI` | unset | `0` / `false` / `off` skips Firecrawl UI autostart (`firecrawl-ui`) |
| `BROS_SIDECAR_OPENJEV` | unset | `0` / `false` / `off` skips OpenJEV autostart |
| `BROS_NETWORK` | `bros` | Shared external Docker network (CLI/dockerode create if missing) |
| `BROS_OLLAMA_PORT` | `11435` | Host publish for sidecar Ollama; host Node Chat/Providers URL |
| `BROS_OPENCODE_PORT` | `4097` | Host publish for OpenCode |
| `BROS_OPENWEBUI_PORT` | `3080` | Host publish for Open WebUI |
| `BROS_FIRECRAWL_PORT` | `3002` | Host publish for Firecrawl API |
| `BROS_FIRECRAWL_UI_PORT` | `3081` | Host publish for Firecrawl UI |
| `BROS_WHISPER_PORT` | `8090` | Host publish for Whisper STT; host Node transcribe URL |
| `BROS_OPENJEV_PORT` | `8092` | Host publish for OpenJEV API (container 8080) |
| `BROS_FIRECRAWL_POSTGRES_PASSWORD` | local default | Firecrawl Postgres (not published) |
| `BROS_TUNNEL_PROTOCOL` | `http2` | `cloudflared` protocol (`http2` / `quic` / `auto`) |
| `BROS_TUNNEL_EDGE_IP_VERSION` | `4` | `4` / `6` / `auto` |
| `BROS_TUNNEL_HOST` | unset | Extra Host match for via-tunnel detection |

YAML vs env vs SQLite: [Configuration](/docs/configuration).
