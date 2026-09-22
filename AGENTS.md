# AGENTS

- Product name: **Bros** (BROS: Boxed Runtime Orchestration System)
- Repo (target): `jasenmichael/bros` — Pages base `/bros/`
- CLI: `bros` (default = start); env `BROS_*`; bootstrap `~/.config/bros.yml` or `bros.yml`
- Layout: `docs/`, `src/app`, `src/website`, `src/layers/*`, `src/server`
- Packages: `@bros/app`, `@bros/theme`, `@bros/docs`, `@bros/website`
- Sidecars stay **sidecars** (`/sidecars`, `/api/sidecars`, `sidecars/`, `sidecar.yml`). Kinds: core Ollama (always on); addon (shipped, disable with `BROS_SIDECAR_<ID>=0` or `BROS_SIDECARS_DISABLE`); additional (`$BROS_HOME/data/sidecars/`, `$BROS_HOME/data/sidecar-repos/`)
- Internal specialist Ollama name `bros` (not a Chat/Providers picker): submodule `vendor/bros-model` → https://github.com/jasenmichael/bros-model ; sidecar ensure in `src/server/utils/internalBrosModel.ts`
- Prefer Docker via `pnpm dev` (`BROS_DEV=1 ./bros`); host Node optional for website / `pnpm app:dev` (Node 22+). Host Node talks to sidecar Ollama at `127.0.0.1:11435` and host Ollama at `127.0.0.1` — not Docker DNS. Compose app sidecar APIs use Docker DNS (`ollama:11434`, `whisper:8000`).
- Do not invent path corruption like `@bros/` instead of `/` in URLs or filesystem paths
- Spec wins on behavior; STACK wins on tools — keep README/SPEC/STACK/PLAN/DESIGN in sync
