---
title: Desktop sidecar
description: Core desktop image and the terminal. No host port.
---

# Desktop sidecar

Core package `lib/sidecars/core/desktop`. Always starts. No host port. Listed as **Desktop (core)**. The card links to `/terminal`.

The image and container are `bros-desktop`. Sidecars Update rebuilds that image. Check does not pull it. Compose service `desktop`. Selkies captures one Wayland display. `labwc` nests on it and provides window management and XWayland. The page is [Desktop](/docs/sidecars/gui).

`/terminal` embeds ttyd on container port 7681, proxied at `/terminal/session` from `http://desktop:7681`. The shell is user `bros`, the container hostname is `bros`, and it starts in `$HOME/workspace` (`/home/bros/workspace`). The prompt there is `bros@bros:~/workspace$`. Package installs are [Apps](/docs/apps). Add and edit on `/settings/apps`.

Enabled package apps install when the Desktop image builds, into `/usr/local`. Core always. Addon and custom only when enabled. Container start does not install, except Paperclip, which installs on Start. Bros writes that set to `$BROS_HOST_REPO/lib/sidecars/core/desktop/enabled-apps` when `BROS_HOST_REPO` is set, otherwise under the app directory, which is the Desktop image build context. The Desktop Node binary is 26.7.0. Adding, enabling, or disabling a package app rebuilds the image. An unchanged start does not. A `services` list on `config.yml` is a command or `script` beside that file. Apps Start runs it inside Desktop. `kind: run` may set `uninstall` to a command or a script beside the config. Enable does not start the service. Stop keeps it stopped across a Desktop restart. Sidecar processes start in their own image. Desktop reaches them through the sidecar `cli` wrapper, `gui` window, and `webui` address.

Install state from a live container is not used. App `volumes` and `webui` publish ports are `config/apps-compose.yml`. Open is `http://127.0.0.1:<publish>/`. Package settings and cache stay under `/home/bros` (`data/home`).

The CLI field starts as the package label. **Also exposes** is a comma-separated list of extra commands. **Interfaces** on that install can be `cli`, `gui`, `webui`, `api`, or `openai`. A `gui` interface shows in the Apps drawer on `/desktop` when that sidecar is not env-disabled, and a package `gui` shows only when the app is enabled. Terminal is the first row. It opens `foot` in `/home/bros/workspace`. The desktop session starts that same foot. On start, a command in `$HOME/.local/bin` is removed when the image already has it, and a Herdr session whose saved directory is missing is set aside. Opening a sidecar row opens the window when that sidecar is already running. It does not start the sidecar. Stop closes that window and leaves the sidecar up. Sidecar `cli` rows show on `/terminal` under Expose CLIs on that same rule. Package `cli` rows show under Apps only when enabled. Each install is `lib/apps/<tier>/<id>/config.yml` or `data/config/apps/<id>/config.yml`.

Sidecar `cli` interfaces are listed on `/terminal` under **Expose CLIs**, except shells. Bash stays the Terminal shell. Bros does not write those commands onto the host PATH.

Core apt packages are `lib/sidecars/core/desktop/core-apt.yml`. They are baked into the image, not rows in the list. `python3` is that list. `python-is-python3` makes `python` the same interpreter.

Each enabled package install is its own image layer in the generated `enabled-apps/Dockerfile`. An unchanged layer stays cached. Deb files and curl trees sit in the Docker build cache `bros-pkg` (`/var/cache/bros` during the build), not under `data/`. A run Update changes that app's stamp so its curl runs again. Other layers stay cache hits. App `volumes` stay as they are. After a Desktop replace, Bros waits until Selkies, ttyd, the XWayland socket, and `/home/bros/.XDG/wayland-0` answer. The Nix store is `${BROS_HOST_DATA_DIR}/home/nix`, mounted at `/nix`. The profile is `/home/bros/.nix`. Bins are linked into `/usr/local/bin`. A rebuilt image keeps both. Nix package apps install on container start, after the store exists. Other package kinds stay image layers. The cargo registry cache uses the `bros-pkg` mount.

`bros run` and `bros shell` use this container when it is already up (service `desktop`, workdir `$HOME/workspace`). `bros app update <id>` updates a package app or a sidecar app. Usage: [bros](/docs/cli).

## Binds

- `$BROS_HOST_DATA_DIR/config/apps` → `/opt/bros/apps`
- `$BROS_HOST_DATA_DIR/home` → `/home/bros`
- `$BROS_HOST_WORKSPACE` → `/home/bros/workspace` (default `home/workspace`)
- `$BROS_HOST_REPO` → `/app` (read-only)
- Docker socket
- volume `bros-x11` → `/tmp/.X11-unix`
- volume `bros-run` → `/tmp/bros-run`

s6 starts as root so Selkies can start. `PUID` and `PGID` are the desktop user. Package GUI processes run as that user.

Hub: [Sidecars](/docs/sidecars).
