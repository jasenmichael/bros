# AGENTS

Bros (**B**oxed **R**untime **O**rchestration **S**ystem) is a Docker-isolated local AI control plane: chat, providers, and sidecars. Repo `jasenmichael/bros`. GitHub Pages base is `/bros/`. The `bros` CLI defaults to start. One config file: `$BROS_DIR/bros.yml`.

## Contract

Before editing, read the file that owns the change. Update that file when the change moves its contract.

- [SPEC.md](SPEC.md) wins on behavior
- [STACK.md](STACK.md) wins on tools and layout
- [DESIGN.md](DESIGN.md) wins on visual UI
- [PLAN.md](PLAN.md) is the current engineering plan
- [README.md](README.md) is human setup

## Setup

pnpm workspace root is `src/`.

Contributor loop:

```bash
BROS_DEV=1 ./bros
```

App: http://127.0.0.1:3055. After Dockerfile or compose changes:

```bash
BROS_DEV=1 ./bros update
```

Optional host Node 22+:

```bash
pnpm --dir src install
pnpm --dir src app:dev
pnpm --dir src docs:dev
```

Docs site: http://127.0.0.1:3056/bros/. Full notes: [docs/development.md](docs/development.md).

## Read before editing

- App behavior (chat, providers, sidecars, status, settings, tunnel, auth): [SPEC.md](SPEC.md), then the matching page under `docs/`
- Ports, compose, layers, packages, and the utils folder rule: [STACK.md](STACK.md)
- Dock, pages, visual UI: [DESIGN.md](DESIGN.md)
- Milestone and follow-ups: [PLAN.md](PLAN.md)
- Env: [docs/environment.md](docs/environment.md). Bootstrap YAML vs SQLite: [docs/configuration.md](docs/configuration.md)
- HTTP API: [docs/api.md](docs/api.md)
- A sidecar pack: [docs/sidecars.md](docs/sidecars.md) and `docs/sidecars/<id>.md`
- Chat routes or agent wording: [docs/agent.md](docs/agent.md). There is no `/agent` page. Chat is one completion.
- Docs site and Pages: [docs/website.md](docs/website.md)

## Constraints

- Product word is **sidecar** (`/sidecars`, `/api/sidecars`, `sidecar.yml`)
- Write real `/` paths. A corrupted `@bros/` path is not a package or a URL
- pnpm workspace root is `src/` (`@bros/app`, `@bros/theme`, `@bros/docs`, `@bros/website`)
- Prefer Docker via `BROS_DEV=1 ./bros`. Host Node talks to sidecar Ollama at `127.0.0.1:11435` and host Ollama at `127.0.0.1`. Compose-app calls use Docker DNS (`ollama:11434`, `whisper:8000`)
- Dev does not mount `/app/sidecars/{core,addon,custom}` (those mounts are production-only). Discovery uses `/app/lib/sidecars` and `/app/sidecars`. Custom packs live only in gitignored `$BROS_SIDECARS_DIR`. Do not commit them. A custom pack can later move to `lib/sidecars/addon/` or `lib/sidecars/core/`. An addon can later move to core. Mount and pack rules live in the Sidecars section of [SPEC.md](SPEC.md)
- Internal Ollama model `bros` is for app jobs (titles). It is not a Chat or Providers picker. Ensure path: `src/server/utils/internalBrosModel.ts`

## Testing

```bash
pnpm --dir src test
pnpm --dir src typecheck
```

Vitest runs through `@bros/app`. Unit, nuxt, and e2e tests live in repo `test/`. One file:

```bash
pnpm --dir src --filter @bros/app exec vitest run ../../test/unit/<file>.test.ts
```

Add or update a test when behavior changes.

## Security

Do not commit `data/`, `.env`, `*.sqlite`, passkey, or proxy key. The tracked template is `example.env` (commented defaults and empty placeholders). There is no `.env.example`.

Never put secrets or a personal dev tunnel URL in `example.env` or `.env.example`. That includes API keys, passkey, proxy key, passwords, `BROS_PUBLIC_URL`, and `BROS_TUNNEL_HOST`. Those values stay in gitignored `.env` or `$BROS_DIR/bros.yml`.
