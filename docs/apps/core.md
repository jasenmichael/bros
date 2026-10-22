---
title: Core apps
description: npm, pnpm, bun, and uv. Always enabled in the Desktop image.
---

# Core apps

`lib/apps/core/`. Always enabled. No Enable switch. Each install is its own image layer and lands in `/usr/local`. Settings and cache are home directories under `data/home`, not the install prefix. Each `bin` shows under **Apps** on `/terminal`.

- **npm** — `lib/apps/core/npm/config.yml`. Spec `npm`. Home `.npm` and `.local`.
- **pnpm** — `lib/apps/core/pnpm/config.yml`. Spec `pnpm`. Home `.local/share/pnpm`.
- **bun** — `lib/apps/core/bun/config.yml`. Spec `bun`. Home `.bun`.
- **uv** — `lib/apps/core/uv/config.yml`. Spec `uv`. Home `.cache/uv`. A later uv spec is a PyPI name or `name==version` (`uv tool install`).

deno, cargo, nix, apt, deb, and run are managers for an addon or custom app. They are not rows in this bundle. See [Apps](/docs/apps).

Hub: [Apps](/docs/apps).
