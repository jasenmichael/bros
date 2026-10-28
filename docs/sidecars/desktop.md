---
title: Desktop sidecar
description: Core desktop image and the terminal. No host port.
---

# Desktop sidecar

Core package `lib/sidecars/core/desktop`. Always starts. No host port. Listed as **Desktop (core)**. The card links to `/terminal`.

The image and container are `bros-desktop`. Sidecars Update rebuilds that image. Check does not pull it. Compose service `desktop`. Selkies captures one Wayland display. `labwc` nests on it and provides window management and XWayland. The page is [Desktop](/docs/sidecars/gui).

`/terminal` embeds ttyd on container port 7681, proxied at `/terminal/session` from `http://desktop:7681`. The shell is the desktop user `bros` at `PUID`/`PGID`, the container hostname is `bros`, and it starts in `$HOME/workspace` (`/home/bros/workspace`). The prompt there is `bros@bros:~/workspace$`. Foot is that same uid. Passwd also lists `abc` for that uid. See docs/adr/0003-desktop-user-bros.md. Package installs are [Apps](/docs/apps). Add and edit on `/settings/desktop`.

`kind: run` installs when the Desktop image builds. Bros writes that desktop build to `$BROS_DIR/data/build/desktop`. Other enabled apps install after the session answers. Core always. Addon and custom only when enabled. The Node pin is `BROS_NODE_VERSION` (`node -v` where `./bros` runs, else `26.7.0`). Devbox installs from `https://get.jetify.com/devbox` as the desktop user when `devbox` is not already installed. A cached Nix store stays in place. Add and Enable do not rebuild. A run set that differs from the last stamp shows Rebuild. Update on a run app rebuilds that layer. An unchanged start does not. A `services` list on `config.yml` is a command or `script` beside that file. Service scripts are read from `/app/lib/apps` and `/opt/bros/apps`. Apps Start, Stop, and Restart control that service inside Desktop. Restart bumps a count in `running.json`. Stdout and stderr go to `data/var/logs/apps/<id>.log`. `kind: run` may set `uninstall` to a command or a script beside the config. Enable does not start the service. Stop keeps it stopped across a Desktop restart. The log file stays. Sidecar processes start in their own image. Desktop reaches them through the sidecar `cli` wrapper, `gui` window, and `webui` address.

Install state from a live container is not used. App `volumes` and `webui` publish ports are `config/apps-compose.yml`. Open is `http://127.0.0.1:<publish>/`. Package settings and cache stay under `/home/bros` (`data/home`).

The CLI field starts as the package label. **Also exposes** is a comma-separated list of extra commands. **Interfaces** on that install can be `cli`, `gui`, `webui`, `api`, or `openai`. A `gui` interface shows in the app library on `/desktop` when that sidecar is not env-disabled, and a package `gui` shows only when the app is enabled. The Drawer sits at the bottom and shows on hover or touch. It lists running apps, pinned launchers, and the library icon. A mark means a window is mapped. Running rows come first. Terminal opens `foot` in `/home/bros/workspace`. The desktop session starts that same foot. On start, a command in `$HOME/.local/bin` is removed when the image already has it, and a Herdr session whose saved directory is missing is set aside. Opening a sidecar row opens another window when that sidecar is already running. It does not start the sidecar. Close kills the newest window and leaves the sidecar up.  Sidecar `cli` rows show on `/terminal` under Expose CLIs on that same rule. Package `cli` rows show under Apps only when enabled. Each install is `lib/apps/<tier>/<id>/config.yml` or `data/config/apps/<id>/config.yml`.

Sidecar `cli` interfaces are listed on `/terminal` under **Expose CLIs**, except shells. Bash stays the Terminal shell. Bros does not write those commands onto the host PATH. A package app may ship `launch.sh` beside `config.yml`. Desktop start copies it to `$HOME/.local/sidecar-bins/<bin>`. The session sets `LIBGL_ALWAYS_SOFTWARE=1` and does not set `LD_LIBRARY_PATH`. See docs/adr/0004-app-launch-script.md.

Core apt packages are `lib/sidecars/core/desktop/core-apt.yml`. They are baked into the image, not rows in the list. `python3` is that list. `python-is-python3` makes `python` the same interpreter.

A `kind: run` install is its own image layer in `$BROS_DIR/data/build/desktop/Dockerfile`. The checkout `lib/sidecars` is the extra Docker context `sidecars`. See docs/adr/0002-desktop-build-context.md. An unchanged layer stays cached. That layer bind-mounts `node` from the Bros image (`bros:dev` or `bros:latest`) to run `install.mjs` and does not leave that binary on `PATH`. Deb files for a run build sit in the Docker build cache `bros-pkg` (`/var/cache/bros` during the build). Runtime deb files are `data/cache/deb`. A run Update changes that app's stamp so its curl runs again. Other layers stay cache hits. App `volumes` stay as they are. After a Desktop replace, Bros waits until Selkies, ttyd, the XWayland socket, and `/home/bros/.XDG/wayland-0` answer. Session gaps skip ensure. When the session answers, ensure installs missing enabled apps one at a time. Devbox data is `/home/bros/.local/share/devbox`. Nix user state is `/home/bros/.local/state/nix`. The store stays at `/nix` inside the container. The host bind is `$BROS_DIR/data/home/nix`. A store path or profile already on that mount skips the Devbox install. Ensure does not download Nix. See docs/adr/0001-desktop-nix-store.md.

`bros run` and `bros shell` use this container when it is already up (service `desktop`, workdir `$HOME/workspace`). `bros app update <id>` updates a package app or a sidecar app. Usage: [bros](/docs/cli).

## Binds

- `$BROS_HOST_DATA_DIR/config/apps` → `/opt/bros/apps`
- `$BROS_HOST_DATA_DIR/home` → `/home/bros`
- `$BROS_HOST_DATA_DIR/home/nix` → `/nix`
- `$BROS_HOST_DATA_DIR/cache/apt/archives` → `/var/cache/apt/archives`
- `$BROS_HOST_DATA_DIR/cache/apt/lists` → `/var/lib/apt/lists`
- `$BROS_HOST_DATA_DIR/cache/deb` → `/var/cache/bros/debs`
- `$BROS_HOST_DATA_DIR/var/logs` → `/var/log/bros`
- `$BROS_HOST_WORKSPACE` → `/home/bros/workspace` (default `home/workspace`)
- `$BROS_HOST_REPO` → `/app` (read-only)
- Docker socket
- volume `bros-x11` → `/tmp/.X11-unix`
- volume `bros-run` → `/tmp/bros-run`

s6 starts as root so Selkies can start. `PUID` and `PGID` are the desktop user `bros`. Package GUI processes run as that user. The group name stays `abc`.

Hub: [Sidecars](/docs/sidecars).
