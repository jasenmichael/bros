---
title: Getting started
description: Run Bros with Docker only.
---

# Getting started

Bros runs entirely through Docker. The host needs Docker and Docker Compose. Optional: host `cloudflared` (install + `cloudflared login`). Set `public_url` in `~/.config/bros.yml` (or `bros.yml`) to start a named tunnel for that hostname; otherwise `bros` may prompt, and the Dashboard Tunnel card starts a quick tunnel.

The `bros` CLI defaults to **start** when no command is passed. Explicit `start` still works as an optional alias.

## Install

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

Optional systemd user service (Linux):

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --service
```

Clones https://github.com/jasenmichael/bros.git into `~/.bros` (`BROS_HOME`; override with `BROS_HOME` / `BROS_DIR` / `BROS_REPO` / `BROS_REF`). Writes `~/.config/bros.yml` if missing. Symlinks `~/.local/bin/bros`. Docs site: https://jasenmichael.github.io/bros/

A repo checkout (CLI next to `docker-compose.yml` + `sidecars/`) uses that directory as `BROS_HOME`. Persistent binds live under `$BROS_HOME/data` (`$BROS_HOST_DATA_DIR`).

## Run

```bash
bros
```

Interactive production compose (`docker-compose.yml` + `docker-compose.prod.yml`, `up --build`). Ctrl+C stops the **full stack**: all `bros-sc-*` sidecars, then core `compose down`. Start also removes legacy `forgebox-sc-*` leftovers so they never run beside Bros. First start brings up the Ollama sidecar and installs the internal `bros` model when the packaged GGUF is present.

```bash
bros -D
```

Same stack, daemonized.

```bash
bros stop
bros status
bros update
bros service status
```

Open [http://127.0.0.1:3055](http://127.0.0.1:3055).

Login passkey is printed in the container logs at startup (`[bros] passkey: …`) and stored in `$BROS_HOST_DATA_DIR/passkey`. Change it in Settings (updates that file).

Docker hot-reload for contributors is documented in the repo [README Development](https://github.com/jasenmichael/bros#development) section (`pnpm dev`).

## Models

On **Models**, sidecar Ollama and host Ollama sit under **Ollama** (host stays listed when stopped). Custom OpenAI-compatible providers (base URL + optional key + model names) sit under **Custom providers**, with **Add custom** there. Chat picks a provider, then a model. Sidecar DNS is `http://ollama:11434` on the Docker network (host publish **11435**). Pull and chat use the host Ollama disk, not `$BROS_HOME/data/ollama`. Settings (including GPU for the sidecar only) open from the row cog, not a page-level Settings block.

On **Models**, selecting an Ollama card expands pull on that card. Pull from the menu or type any valid Ollama name (`llama3.2` or community `owner/name:tag`):

1. **Yours** — names you added; kept after refresh in `config.customModels`
2. **Recommended** — official (and verified community) tags **≤ 16 GB**, sized for detected CPU/GPU VRAM
3. **Ollama** — registry names (`ollama pull llama3.2`)
4. **Hugging Face** — GGUF via `hf.co/user/repo` or `hf.co/user/repo:Q4_K_M`

`qwen3-coder:14b` is not a library tag. Use `freehuntx/qwen3-coder:14b` or `qwen2.5-coder:14b`. 30B tags (~19 GB) stay in the Ollama list, not Recommended.

If an NVIDIA GPU is present, open the sidecar cog and enable **Use GPU** to restart the Ollama sidecar with GPU access. Host Ollama cannot configure GPU.

## Bootstrap config

Bros loads `working_dir` and `data_dir` from:

1. `BROS_CONFIG` (exclusive file; install default `~/.config/bros.yml`), or
2. `.config/bros.yml` then `./bros.yml`
3. Environment overrides (`BROS_WORKING_DIR`, `BROS_DATA_DIR`)

Host data is `$BROS_HOME/data` (`BROS_HOST_DATA_DIR`). In-container `BROS_DATA_DIR` stays `/data`.

All other settings live in SQLite and the UI.
