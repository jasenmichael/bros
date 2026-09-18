# AGENTS

- Product name: **Bros** (BROS: Boxed Runtime Orchestration System)
- Repo (target): `jasenmichael/bros` — Pages base `/bros/`
- CLI: `bros` (default = start); env `BROS_*`; bootstrap `~/.config/bros.yml` or `bros.yml`
- Layout: `docs/`, `src/app`, `src/website`, `src/layers/*`, `src/server`
- Packages: `@bros/app`, `@bros/theme`, `@bros/docs`, `@bros/website`
- Sidecars stay **sidecars** (`/sidecars`, `/api/sidecars`, `sidecars/`, `sidecar.yml`)
- Prefer Docker via `pnpm dev` (`BROS_DEV=1 ./bros`); host Node optional for website / `pnpm app:dev` (Node 22+)
- Do not invent path corruption like `@bros/` instead of `/` in URLs or filesystem paths
- Spec wins on behavior; STACK wins on tools — keep README/SPEC/STACK/PLAN/DESIGN in sync
