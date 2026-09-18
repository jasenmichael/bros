# Bros

**B**oxed **R**untime **O**rchestration **S**ystem — local AI control plane: chat, models, and Docker-managed sidecars.

## Install

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

Optional systemd user service:

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --service
```

Clones [jasenmichael/bros](https://github.com/jasenmichael/bros) into `~/.bros` (`BROS_HOME`; `BROS_DIR` is an alias). Writes `~/.config/bros.yml` if missing. Symlinks `~/.local/bin/bros`. Docs: https://jasenmichael.github.io/bros/

## Quick start

```bash
bros                 # foreground start (production compose)
bros -D              # production daemon
bros stop            # stop core + sidecars
bros status
bros update          # git pull + submodule + images + rebuild
bros service install # systemd --user (Linux)
```

Default action (no command) is **start**. Open http://127.0.0.1:3055

Host needs Docker only — no host Node for the app. Optional host `cloudflared` (install + `cloudflared login`). Set `public_url` in `~/.config/bros.yml` to start a named tunnel for that hostname.

## Data directory

`BROS_HOME` is the checkout when the CLI sits next to `docker-compose.yml` + `sidecars/`. The installed clone is `~/.bros`. Override with `BROS_HOME` or `BROS_DIR`. Persistent binds live under `$BROS_HOME/data` (`BROS_HOST_DATA_DIR`):

- `$BROS_HOST_DATA_DIR` → app `/data` (SQLite, custom sidecars, logs)
- `$BROS_HOST_DATA_DIR/ollama` → Ollama `/root/.ollama`
- `$BROS_HOST_DATA_DIR/openwebui` → Open WebUI data
- `$BROS_HOST_DATA_DIR/opencode` → OpenCode workspace

In-container `BROS_DATA_DIR` stays `/data`. Do not commit `data/`, `.env`, `.nuxt`, or `node_modules`.

## Models

On **Models** (and Chat when both are up), pick **Host** Ollama or the Bros **Sidecar** (Docker DNS `http://ollama:11434`; host publish **11435**). Pull and chat use the host Ollama disk, not `$BROS_HOME/data/ollama`.

On **Models**, pull from the menu or type any valid Ollama name (`name:tag` or community `owner/name:tag`):

1. **Yours** — names you added; persisted in the Ollama provider `config.customModels`
2. **Recommended** — official (and verified community) tags whose on-disk size is **≤ 16 GB**
3. **Ollama** — registry names
4. **Hugging Face** — GGUF via `hf.co/user/repo`

`qwen3-coder:14b` is not a library tag (official coder is `:30b` / `:480b`). Use `freehuntx/qwen3-coder:14b` or `qwen2.5-coder:14b`. 30B tags (~19 GB) stay in the Ollama list, not Recommended.

## Development

### Deps

**UI app (Docker, preferred):** Docker Engine + Compose v2, Git. The app process runs in `bros:dev` — no host Node required for that. Host `pnpm` is only needed to type `pnpm dev` (Node **22+**, pnpm **9.15** per `packageManager`). Equivalent with no host Node: `BROS_DEV=1 ./bros`.

**Website** (and optional host Nuxt): Node **22+**, pnpm **9.15**, then `pnpm install` at the repo root.

### UI app (`@bros/app`)

Clone this repo (a curl install tree works if you develop there).

```bash
pnpm dev
# http://127.0.0.1:3055
```

Docker bind-mount stack. First start builds `bros:dev` if it is missing. Later starts skip rebuild. Ctrl+C stops the full stack (core + sidecars).

After Dockerfile or compose changes:

```bash
pnpm dev:update
```

Stop a leftover stack:

```bash
BROS_DEV=1 ./bros stop
```

Optional host-only Nuxt (no app container; Docker still needed for sidecars via the socket):

```bash
pnpm install
pnpm app:dev
pnpm test
```

The Cloudflare tunnel hostname works on the Docker dev stack too (Vite client JS must load; otherwise Unlock does nothing).

Login passkey is printed in the container logs at startup (`[bros] passkey: …`) and stored in `$BROS_HOST_DATA_DIR/passkey`.

### Website (`@bros/website`)

Static site in `src/website`, `baseURL` `/bros/`. Content is repo `docs/`. Theme and docs layers are shared with the app.

```bash
pnpm install
pnpm docs:dev
# http://127.0.0.1:3056/bros/

pnpm docs:generate
pnpm --filter @bros/website preview
```

## Workspace (pnpm)

| Path | Package | Role |
|------|---------|------|
| `src/app/` | `@bros/app` | Bros UI + Nitro API; extends theme + docs; **`/` = dashboard** |
| `src/layers/docs/` | `@bros/docs` | Docs layer — content from `docs/`, `/docs` routes; extends theme |
| `src/layers/theme/` | `@bros/theme` | Nuxt UI, layouts, nav chrome, markdown/prose |
| `src/website/` | `@bros/website` | Static site homepage + `extends`; `pnpm docs:generate` → GitHub Pages `/bros/` |
| `sidecars/` | — | Core sidecar packages |

```text
theme  →  docs  →  @bros/app     (`/` = dashboard)
                →  @bros/website (`/` = marketing)
```

See [SPEC.md](./SPEC.md), [STACK.md](./STACK.md), [PLAN.md](./PLAN.md), [DESIGN.md](./DESIGN.md).
