---
title: Apps
description: Package installs on the Desktop, and how sidecar apps reach the desktop.
---

# Apps

An app is a sidecar or a package install. Core, addon, and custom are the tiers for both. This page is the package catalog. Sidecar packs stay under [Sidecars](/docs/sidecars).

Add and edit package apps on `/settings/desktop`. The image and binds are [Desktop sidecar](/docs/sidecars/desktop). The stream is [Desktop](/docs/sidecars/gui).

## Package app and sidecar app

A **package app** is `lib/apps/<tier>/<id>/config.yml`, or `data/config/apps/<id>/config.yml` for a custom app. `kind: run` is a Desktop image layer. Every other enabled app installs after the Desktop session answers, one at a time, into the Desktop home. A later start skips a command that already runs. Core is always on. An addon or custom app installs only after Enable. Paperclip still installs on Start. The process runs inside `bros-desktop` and shares `127.0.0.1` with the rest of that container.

A **sidecar app** is a sidecar. It keeps its own image and container (`bros-sc-<id>`). Bros does not install it into the Desktop image. Desktop reaches it through a `cli` wrapper, a `gui` window, or a `webui` address.

## Desktop wiring

A package `cli` shows under **Apps** on `/terminal` only when that app is enabled. The command is the binary on the Desktop PATH.

A package `gui` shows in the app library on `/desktop` only when that app is enabled. It shows in the Drawer when it is pinned or a window is open. A click runs `desktop-gui.sh` inside Desktop with no `--container` and opens another window. The process is the desktop user `bros` with `HOME=/home/bros`. Terminal opens `foot` in `/home/bros/workspace`. Running Drawer rows come first. The icon comes from a desktop entry whose `Exec` basename matches the gui command. The gui command is still the launch line. 

A package `webui` `publish` is a host port, written with app `volumes` into `config/apps-compose.yml`. Open is `http://127.0.0.1:<publish>/`.

`bros app update <id>` updates a package app through its package manager. Check stays on the settings row. Update shows only after Check finds a newer version. For node, that version is the `BROS_NODE_VERSION` pin, and Check does not offer a Node newer than the pin. `kind: run` has no Check. Add and Enable queue one Rebuild. Its Update writes a force stamp and rebuilds Desktop so that curl runs again. That rebuild waits until the Desktop session answers. An addon row has Disable. That sets enabled false and removes the command. Caches stay. Core has no Disable. A custom Remove uninstalls the same way. An app with a service has Logs at `/settings/desktop/<id>/logs`. The file stays after Stop.

A sidecar `cli`, except a shell, gets a wrapper in `data/home/.local/sidecar-bins`. That directory is first on the Desktop `PATH`. While the sidecar is running, the wrapper is `docker compose exec` into it. While it is stopped, and `~/.local/bin/<bin>` exists on the host, the wrapper runs that host binary. Bros does not write the host PATH. Those rows are **Expose CLIs** on `/terminal` when the pack is not env-disabled. Shipped sidecar CLIs are OpenCode (`opencode`) and Pi (`pi`).

A sidecar `gui` shows in the app library when the pack is not env-disabled. It shows in the Drawer when it is pinned or a window is open. A click does not start the container. When the container is already running, Desktop runs `desktop-gui.sh start <id> --container <name> -- <command>`. That starts another window. It does not kill the ones already open. That `docker exec`s the command in the sidecar with `DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`, and `XDG_RUNTIME_DIR=/home/bros/.XDG`. Close kills the newest window. Stop kills every window for that id. The sidecar stays up. The desktop stays up. 

Compose that contains `container:bros-desktop` shares Desktop's network namespace. That sidecar cannot publish a host port, is not attached to network `bros`, and starts only after `bros-desktop` is up. No shipped sidecar uses that namespace. A service sidecar with no `gui` interface keeps its own network and stays reachable by Docker DNS.

## Tiers

**Core** — `lib/apps/core/`. Always enabled. See [Core apps](/docs/apps/core).

**Addon** — `lib/apps/addon/<id>/config.yml`. Shipped, listed, and off until Enable.

**Custom** — `data/config/apps/<id>/config.yml`. Scripts sit beside that file. Enable flags stay in `data/`.

## Kinds

node, cargo, pnpm, bun, deno, and uv are the core apps. npm, pnpm, bun, deno, uv, and cargo stay the managers for a later spec of that kind. npm is a kind, not a core row. Apt, deb, nix, and run are managers too. A deno spec is `npm:name` or `jsr:name` (cache `/home/bros/.deno`). A cargo spec is `name` or `name@version` (`cargo install --locked --root /home/bros/.cargo`). There is no rustup. The core cargo app is the Nix `cargo`. Nix is a nixpkgs name (`ripgrep`) installed with `devbox global add`. A saved `nixpkgs#ripgrep` still installs. Apt is `apt-get install -y` on ensure. Base apt in `core-apt.yml` stays in the image. Deb is an https URL. A path segment `latest` is what Check compares. Run is one curl or wget command, run as written, and it is the image layer. The Nix layout is [Desktop sidecar](/docs/sidecars/desktop).

## Shipped

- [Core apps](/docs/apps/core) — node, cargo, pnpm, bun, deno, uv. Always on
- [Cursor](/docs/apps/cursor) — addon, deb, CLI and window
- [Agent](/docs/apps/agent) — addon, run, `agent` and `cursor-agent`
- [Paperclip](/docs/apps/paperclip) — addon, npm, web UI on **3100**
- [jq](/docs/apps/jq) — addon, apt, no CLI or window
- [OpenCode](/docs/apps/opencode) — addon, npm, web UI on **4097** (container **4096**)
