---
name: bros-dev
description: >-
  Develop Bros from a git checkout: pnpm workspace src/, scripts/build.sh,
  BROS_DEV=1, tests, and docs site. Use when editing jasenmichael/bros source —
  not when only operating a release install under ~/.bros.
---

# Bros checkout development

Repo: [jasenmichael/bros](https://github.com/jasenmichael/bros). pnpm workspace root is `src/`. Needs Docker, host `pnpm`, and `cargo`.

## Contract stack

Before editing, read the file that owns the change. Update it when behavior moves.

1. **SPEC.md** — behavior
2. **STACK.md** — tools and layout
3. **DESIGN.md** — visual UI
4. **PLAN.md** — current engineering plan
5. **README.md** — human setup

Words: [GLOSSARY.md](https://github.com/jasenmichael/bros/blob/main/GLOSSARY.md). Product word is **app**.

## Build / run

```bash
pnpm --dir src install
scripts/build.sh
./bros                    # production UI on :3055
BROS_DEV=1 ./bros         # hot-reload UI (or ./bros --dev)
```

After Dockerfile/compose changes: `BROS_DEV=1 ./bros update`. Docs site: `pnpm --dir src docs:dev` → `http://127.0.0.1:3056/bros/`.

`--use-runner` / `BROS_USE_RUNNER=1` with `--dev` errors.

## Tests

```bash
pnpm --dir src test
pnpm --dir src typecheck
```

## Constraints

- Host Node → core Ollama `127.0.0.1:11435`; compose apps use Docker DNS (`ollama:11434`)
- Custom apps: `data/config/apps`; shipped packs: `lib/apps/core|addon/<id>/`
- Never commit `data/`, `.env`, passkey, proxy key, sqlite. Template is `example.env` only
- Internal Ollama model `bros` is for titles — not a Chat picker

Operator lifecycle without source: `bros-cli`. HTTP: `bros-api`.
