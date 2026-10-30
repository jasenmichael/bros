# AGENTS

Bros (**B**oxed **R**untime **O**rchestration **S**ystem) manages Docker containers for local AI applications and development, and runs a desktop in the browser. Repo `jasenmichael/bros`. GitHub Pages base is `/bros/`. The `bros` command defaults to start. One config file: `$BROS_DIR/data/config/bros.yml`. Words: [GLOSSARY.md](GLOSSARY.md).

## Contract

Before editing, read the file that owns the change. Update that file when the change moves its contract.

- [SPEC.md](SPEC.md) wins on behavior. SPEC does not name the language, frameworks, or source paths.
- [STACK.md](STACK.md) wins on tools and layout
- [DESIGN.md](DESIGN.md) wins on visual UI
- [PLAN.md](PLAN.md) is the current engineering plan
- [README.md](README.md) is human setup

## Setup

pnpm workspace root is `src/`.

Dev requires host `pnpm` and `cargo`. The UI runs on the host. Prod needs Docker. Prod uses host `pnpm` for the UI when it exists, otherwise container `bros-ui`. `--use-runner` or `BROS_USE_RUNNER=1` forces `bros-ui`. Dev with either errors.

Build + run (production UI):

```bash
pnpm --dir src install
scripts/build.sh
./bros
```

Dev (hot-reload UI):

```bash
pnpm --dir src install
BROS_DEV=1 ./bros
# or: ./bros --dev
```

App: http://127.0.0.1:3055. After Dockerfile or compose changes: `BROS_DEV=1 ./bros update`. Docs: `pnpm --dir src docs:dev`.

Docs site: http://127.0.0.1:3056/bros/. Full notes: [docs/development.md](docs/development.md).

## Read before editing

- Words: [GLOSSARY.md](GLOSSARY.md). The `bros` binary is the CLI.
- App behavior (chat, providers, apps, status, settings, tunnel, auth): [SPEC.md](SPEC.md), then the matching page under `docs/`
- Ports, compose, layers, packages, and the utils folder rule: [STACK.md](STACK.md)
- Dock, pages, visual UI: [DESIGN.md](DESIGN.md)
- Milestone and follow-ups: [PLAN.md](PLAN.md)
- Env: [docs/environment.md](docs/environment.md). Bootstrap YAML vs SQLite: [docs/configuration.md](docs/configuration.md)
- HTTP API: [docs/api.md](docs/api.md)
- A docker app pack: [docs/apps.md](docs/apps.md) and `docs/apps/<id>.md`; desktop: [docs/desktop.md](docs/desktop.md) and [docs/desktop-gui.md](docs/desktop-gui.md)
- Chat routes or agent wording: [docs/agent.md](docs/agent.md) and [docs/agents.md](docs/agents.md). There is no `/agent` page. Chat is one completion. The job board is `/agents`.
- Docs site and Pages: [docs/website.md](docs/website.md)

## Constraints

- Product word is **app** (`/apps`, `GET /api/apps`). Compose control is `/api/apps/*`. Env disable keys are `BROS_APP_*` and `BROS_APPS_DISABLE`
- Write real `/` paths. A corrupted `@bros/` path is not a package or a URL
- pnpm workspace root is `src/` (`@bros/ui`, `@bros/theme`, `@bros/docs`, `@bros/website`)
- Prefer Docker via `BROS_DEV=1 ./bros`. Host Node talks to core Ollama at `127.0.0.1:11435` and host Ollama at `127.0.0.1`. Compose-app calls use Docker DNS (`ollama:11434`, `whisper:8000`)
- Dev discovers docker apps at `/app/lib/apps/core` and `/app/lib/apps/addon`, plus package apps under `/app/lib/apps`. Custom apps live in `data/config/apps`. A custom app can later move to `lib/apps/addon/` or `lib/apps/core/`. An addon can later move to core. Mount and pack rules live in the Apps section of [SPEC.md](SPEC.md)
- Internal Ollama model `bros` is for app jobs (titles). It is not a Chat or Providers picker. Ensure path: `src/server/utils/internalBrosModel.ts`
- Nix has one install. Run the [Devbox install script](https://www.jetify.com/docs/devbox/installing-devbox) as the non-root desktop user, and only when `devbox` is not already installed. Devbox installs Nix in single-user mode when Nix is not already present. Do not add another Nix installer (`nixos.org/nix/install`, a Nix tarball, the Determinate installer, or a Devbox GitHub release tarball).

```bash
curl -fsSL https://get.jetify.com/devbox | bash
```

## Commits

Write the commit prefix from the change. `feat` is a minor bump. `fix` and `perf` are a patch. `feat!` or a `BREAKING CHANGE` footer is major. `chore`, `docs`, `refactor`, `test`, and `ci` do not bump. Do not bump `VERSION` in an ordinary change. The product version is `0.0.1`. The packaged model release is `lib/apps/core/ollama/BROS_MODEL_VERSION` (`1.0.0`). Until tag `v0.0.1` exists, the pull request workflow does not bump. After that tag exists it commits `chore: bump <type> to X.Y.Z` on the branch. It does not push to `main`. The merge publishes when `v<VERSION>` is missing.

## Testing

```bash
pnpm --dir src test
pnpm --dir src typecheck
```

Vitest runs through `@bros/ui`. Unit, nuxt, and e2e tests live in repo `test/`. One file:

```bash
pnpm --dir src --filter @bros/ui exec vitest run ../../test/unit/<file>.test.ts
```

Add or update a test when behavior changes.

## Security

Do not commit `data/`, `.env`, `*.sqlite`, passkey, or proxy key. The tracked template is `example.env` (commented defaults and empty placeholders). There is no `.env.example`.

Never put secrets or a personal dev tunnel URL in `example.env` or `.env.example`. That includes API keys, passkey, proxy key, passwords, `BROS_PUBLIC_URL`, and `BROS_TUNNEL_HOST`. Those values stay in gitignored `.env` or `$BROS_DIR/data/config/bros.yml`.
