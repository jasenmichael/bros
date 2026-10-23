---
title: Apps
description: Package installs in the Desktop image, and how sidecar apps reach the desktop.
---

# Apps

An app is a sidecar or a package install. Core, addon, and custom are the tiers for both. This page is the package catalog. Sidecar packs stay under [Sidecars](/docs/sidecars).

Add and edit package apps on `/settings/apps`. The image and binds are [Desktop sidecar](/docs/sidecars/desktop). The stream is [Desktop](/docs/sidecars/gui).

## Package app and sidecar app

A **package app** is `lib/apps/<tier>/<id>/config.yml`, or `data/config/apps/<id>/config.yml` for a custom app. The Desktop image build installs the enabled set into `/usr/local`. Core is always on. An addon or custom app installs only after Enable. Container start does not install, except Paperclip, which installs on Start. The process runs inside `bros-desktop` and shares `127.0.0.1` with the rest of that container.

A **sidecar app** is a sidecar. It keeps its own image and container (`bros-sc-<id>`). Bros does not install it into the Desktop image. Desktop reaches it through a `cli` wrapper, a `gui` window, or a `webui` address.

## Desktop wiring

A package `cli` shows under **Apps** on `/terminal` only when that app is enabled. The command is the binary in the image or a home bin dir.

A package `gui` shows in the Apps drawer on `/desktop` only when that app is enabled. A click runs `desktop-gui.sh` inside Desktop with no `--container`. The process is user `abc` with `HOME=/home/bros`. Terminal is the first drawer row. It opens `foot` in `/home/bros/workspace`.

A package `webui` `publish` is a host port, written with app `volumes` into `config/apps-compose.yml`. Open is `http://127.0.0.1:<publish>/`.

`bros app update <id>` updates a package app through its package manager. `kind: run` has no Check. Its Update writes a force stamp and rebuilds Desktop so that curl runs again. That rebuild waits until the Desktop session answers.

A sidecar `cli`, except a shell, gets a wrapper in `data/home/.local/sidecar-bins`. That directory is first on the Desktop `PATH`. While the sidecar is running, the wrapper is `docker compose exec` into it. While it is stopped, and `~/.local/bin/<bin>` exists on the host, the wrapper runs that host binary. Bros does not write the host PATH. Those rows are **Expose CLIs** on `/terminal` when the pack is not env-disabled. Shipped sidecar CLIs are OpenCode (`opencode`) and Pi (`pi`).

A sidecar `gui` shows in the Apps drawer when the pack is not env-disabled. A click does not start the container. When the container is already running, Desktop runs `desktop-gui.sh start <id> --container <name> -- <command>`. That `docker exec`s the command in the sidecar with `DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`, and `XDG_RUNTIME_DIR=/home/bros/.XDG`. Stop kills that process. The sidecar stays up. The desktop stays up.

Compose that contains `container:bros-desktop` shares Desktop's network namespace. That sidecar cannot publish a host port, is not attached to network `bros`, and starts only after `bros-desktop` is up. No shipped sidecar uses that namespace. A service sidecar with no `gui` interface keeps its own network and stays reachable by Docker DNS.

## Tiers

**Core** — `lib/apps/core/`. Always enabled. See [Core apps](/docs/apps/core).

**Addon** — `lib/apps/addon/<id>/config.yml`. Shipped, listed, and off until Enable.

**Custom** — `data/config/apps/<id>/config.yml`. Scripts sit beside that file. Enable flags stay in `data/`.

## Kinds

npm, pnpm, bun, and uv are the bundled core apps and the managers for a later spec of that kind. deno, cargo, nix, apt, deb, and run are managers for an addon or custom app. They are not bundled rows. A deno spec is `npm:name` or `jsr:name` (cache `/home/bros/.deno`). Cargo is `name` or `name@version` (`cargo install --locked`). rustup profile minimal installs with the first cargo package. Nix is a nixpkgs name (`ripgrep`). A saved `nixpkgs#ripgrep` still installs. Apt is `apt-get install -y` during the image build. Deb is an https URL. A path segment `latest` is what Check compares. Run is one curl or wget command, run as written. Image layers, the Nix store, and the `bros-pkg` cache are [Desktop sidecar](/docs/sidecars/desktop).

## Shipped

- [Core apps](/docs/apps/core) — npm, pnpm, bun, uv. Always on
- [Cursor](/docs/apps/cursor) — addon, deb, CLI and window
- [Agent](/docs/apps/agent) — addon, run, `agent` and `cursor-agent`
- [Paperclip](/docs/apps/paperclip) — addon, npm, web UI on **3100**
- [jq](/docs/apps/jq) — addon, apt, no CLI or window
