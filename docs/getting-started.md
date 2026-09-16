---
title: Getting started
description: Run Bros with Docker only.
---

# Getting started

Bros runs entirely through Docker. The host only needs Docker and Docker Compose.

The root `./bros` CLI defaults to **start** when no command is passed. Explicit `start` still works as an optional alias — prefer the forms below.

## Install

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

Clones https://github.com/jasenmichael/bros.git into `~/.bros` (override with `BROS_REPO` / `BROS_DIR` / `BROS_REF`). Docs site: https://jasenmichael.github.io/bros/

A repo checkout (CLI next to `docker-compose.yml` + `sidecars/`) uses that directory as `BROS_DIR`. Persistent binds live under `$BROS_DIR/data` (`$BROS_HOST_DATA_DIR`).

## Dev

```bash
./bros --dev
```

Same as `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`.

Dev container bind-mounts the repo at `/app` (toolchain image only — no source baked in). On start it runs `pnpm install`, then `pnpm --filter @bros/app dev`.

`--dev` is always interactive (`-D` / `--daemon` ignored). Ctrl+C stops the **full stack**: all `bros-sc-*` sidecars, then core `compose down`. Start also removes legacy `forgebox-sc-*` leftovers so they never run beside Bros.

Stop / status still use explicit commands:

```bash
./bros stop --dev
./bros status --dev
```

Open [http://127.0.0.1:3055](http://127.0.0.1:3055).

## Production

```bash
./bros -D
```

Same as `docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d`.

## Docs site

The Pages site is `@bros/website` in `src/website` (`baseURL` `/bros/`):

```bash
pnpm docs:dev
# http://127.0.0.1:3056/bros/

pnpm docs:generate
pnpm --filter @bros/website preview
```

## Workspace

- `src/layers/theme` — shared UI theme
- `src/layers/docs` — docs content layer and `/docs` routes (markdown from repo root `docs/`)
- `src/app` — Bros UI; extends docs layer; **overrides `/` with the dashboard**
- `src/website` — static docs/marketing site (`pnpm docs:generate`) published to GitHub Pages
- `docs/` — canonical markdown for Nuxt Content

## Models

On **Models**, pull from the menu or type any valid Ollama name (`llama3.2` or community `owner/name:tag`):

1. **Yours** — names you added; kept after refresh in `config.customModels`
2. **Recommended** — official (and verified community) tags **≤ 16 GB**, sized for detected CPU/GPU VRAM
3. **Ollama** — registry names (`ollama pull llama3.2`)
4. **Hugging Face** — GGUF via `hf.co/user/repo` or `hf.co/user/repo:Q4_K_M`

`qwen3-coder:14b` is not a library tag. Use `freehuntx/qwen3-coder:14b` or `qwen2.5-coder:14b`. 30B tags (~19 GB) stay in the Ollama list, not Recommended.

If an NVIDIA GPU is present, enable **Use GPU** to restart the Ollama sidecar with GPU access.

## Bootstrap config

Bros loads `working_dir` and `data_dir` from:

1. `BROS_CONFIG` (exclusive file), or
2. `.config/bros.yml` then `./bros.yml`
3. Environment overrides (`BROS_WORKING_DIR`, `BROS_DATA_DIR`)

Host data is `$BROS_DIR/data` (`BROS_HOST_DATA_DIR`). In-container `BROS_DATA_DIR` stays `/data`.

All other settings live in SQLite and the UI.
