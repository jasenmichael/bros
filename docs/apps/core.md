---
title: Core apps
description: Package cores plus docker cores Ollama and Whisper.
---

# Core apps

`lib/apps/core/`. Package cores are always enabled. Docker cores are enabled by default; Settings may disable Whisper. Ollama stays on this pass.

## Package cores

Each package core is a Nix package installed with `devbox global add` after the Desktop session answers. A later start skips the app when its command already runs. Settings and cache are home directories under `data/home`. Each command shows under **Apps** on `/terminal`. No Enable and no Disable.

- **node** — `lib/apps/core/node/config.yml`. Name Node. Nix package `nodejs`. Commands `node`, `npm`, and `npx`. The pin is `BROS_NODE_VERSION`.
- **cargo** — `lib/apps/core/cargo/config.yml`. Nix package `cargo`. Commands `cargo` and `rustc`. No rustup.
- **pnpm** — `lib/apps/core/pnpm/config.yml`. Nix package `pnpm`.
- **bun** — `lib/apps/core/bun/config.yml`. Nix package `bun`.
- **deno** — `lib/apps/core/deno/config.yml`. Nix package `deno`.
- **uv** — `lib/apps/core/uv/config.yml`. Nix package `uv`. A later uv spec is a PyPI name or `name==version` (`uv tool install`).

npm, pnpm, bun, deno, uv, and cargo stay package-manager kinds for a later app. npm is a kind. It is not a core app. Apt, deb, nix, and run are managers too.

## Docker cores

- **Ollama** — `lib/apps/core/ollama/`. Always on. See [Ollama](/docs/apps/ollama).
- **Whisper** — `lib/apps/core/whisper/`. Settings **Enable Whisper**. See [Whisper](/docs/apps/whisper).

Hub: [Apps](/docs/apps). Docker packs: [Docker apps](/docs/apps).
