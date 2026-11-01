---
title: Desktop
description: The Wayland session in container bros. The UI host is separate.
---

# Desktop

`lib/desktop` is the desktop image. Container, image, and Compose service are `bros`. Selkies publishes on `127.0.0.1:${BROS_STREAM_PORT:-3300}`. ttyd publishes on `127.0.0.1:${BROS_TTYD_PORT:-7681}`. The UI host listens on `BROS_PORT` (3055) and is not this container. `/terminal` is the shell. `/desktop` is the Selkies stream.

Selkies captures one Wayland display. `labwc` nests on it and provides window management and XWayland. The page is [Desktop](/docs/desktop-gui.md).

`/terminal` embeds ttyd on container port 7681, proxied at `/terminal/session`. A host UI uses `http://127.0.0.1:${BROS_TTYD_PORT:-7681}`. Container `bros-ui` uses `http://bros:7681`. The shell is the desktop user `bros` at `PUID`/`PGID`, the container hostname is `bros`, and it starts in `$HOME/workspace` (`/home/bros/workspace`). The prompt there is `bros@bros:~/workspace$`. Foot is that same uid. Passwd also lists `abc` for that uid. See docs/adr/0003-desktop-user-bros.md. Package installs are [Apps](/docs/apps.md). Add and edit on `/settings/desktop/apps`.

`kind: run` installs when the Desktop image builds. Bros writes that desktop build to `$BROS_DIR/data/build/desktop`. When that directory is not writable, update chowns it through Docker (`bros:latest`, else `bros:dev`). Other enabled apps install after the session answers. Core always. Addon and custom only when enabled. The Node pin is `BROS_NODE_VERSION` (`node -v` where `./bros` runs, else `26.7.0`). Devbox installs from `https://get.jetify.com/devbox` as the desktop user when `devbox` is not already installed. A cached Nix store stays in place. Add and Enable do not rebuild. A run set that differs from the last stamp shows Rebuild. Update on a run app rebuilds that layer. An unchanged start does not. A `services` list on `config.yml` is a command or `script` beside that file. Service scripts are read from `/app/lib/apps` and `/opt/bros/apps`. Apps Start, Stop, and Restart control that service inside Desktop. Restart bumps a count in `running.json`. Stdout and stderr go to `data/var/logs/apps/<id>.log`. `kind: run` may set `uninstall` to a command or a script beside the config. Enable does not start the service. Stop keeps it stopped across a Desktop restart. The log file stays. Docker app processes start in their own image. Desktop reaches them through the docker app `cli` wrapper, `gui` window, and `webui` address.

Install state from a live container is not used. App `volumes` and `webui` publish ports are generated into `config/apps-compose.yml` under Compose service **`bros`**, then merged on host `bros` start/update and Desktop recreate. Open is `http://127.0.0.1:<publish>/` on `/settings/desktop/apps` only while the app is enabled, Forward to host is on, and (when the pack has `services`) the service is running. Drawer and library icons prefer `icon.png` beside the app config. When that file is missing, Bros reads desktop entries inside container `bros` via `docker exec`. Package settings and cache stay under `/home/bros` (`data/home`).

The CLI field starts as the package label. **Also exposes** is a comma-separated list of extra commands. **Interfaces** on that install can be `cli`, `gui`, `webui`, `api`, or `openai`. A `gui` interface shows in the app library on `/desktop` when that docker app is not env-disabled, and a package `gui` shows only when the app is enabled. The Drawer sits at the bottom and shows on hover or touch. It lists running apps, pinned launchers, and the library icon. A mark means a window is mapped. Running rows come first. Terminal opens `foot` in `/home/bros/workspace`. The desktop session starts that same foot. On start, a command in `$HOME/.local/bin` is removed when the image already has it, and a Herdr session whose saved directory is missing is set aside. Opening a docker app row opens another window when that docker app is already running. It does not start the docker app. Close kills the newest window and leaves the docker app up.  Docker app `cli` rows show on `/terminal` in the compact CLI list on that same rule. Package `cli` rows show under Apps only when enabled. Each install is `lib/apps/<tier>/<id>/config.yml` or `data/config/apps/<id>/config.yml`.

Docker app `cli` names appear in the compact CLI list on `/terminal`, except shells. Bash stays the Terminal shell. Bros does not write those commands onto the host PATH. A package app may ship `launch.sh` beside `config.yml`. Desktop start copies it to `$HOME/.local/app-bins/<bin>`. The session sets `LIBGL_ALWAYS_SOFTWARE=1` and does not set `LD_LIBRARY_PATH`. See docs/adr/0004-app-launch-script.md.

Core apt packages are `lib/desktop/core-apt.yml`. They are baked into the image, not rows in the list. `python3` is that list. `python-is-python3` makes `python` the same interpreter. `xdg-desktop-portal`, `xdg-desktop-portal-gtk`, `xdg-desktop-portal-wlr`, `dbus-x11`, and `zenity` are on that list for native file dialogs.

A `kind: run` install is its own image layer in `$BROS_DIR/data/build/desktop/Dockerfile`. The build context is the repo. The extra Docker context `apps` is that data directory. Run layers are `COPY --from=apps`. `/usr/local/bin/node` in the image runs `install.ts`. See docs/adr/0002-desktop-build-context.md and docs/adr/0005-one-bros-container.md. Deb files for a run build sit in the Docker build cache `bros-pkg` (`/var/cache/bros` during the build). Runtime deb files are `data/cache/deb`. A run Update changes that app's stamp so its curl runs again. Other layers stay cache hits. App `volumes` stay as they are. After a Desktop replace, Bros waits until Selkies, ttyd, the XWayland socket, and `/home/bros/.XDG/wayland-0` answer. Session gaps skip ensure. When the session answers, ensure installs missing enabled apps one at a time. Devbox data is `/home/bros/.local/share/devbox`. Nix user state is `/home/bros/.local/state/nix`. The store stays at `/nix` inside the container. The host bind is `$BROS_DIR/data/home/nix`. A store path or profile already on that mount skips the Devbox install. Ensure does not download Nix. See docs/adr/0001-desktop-nix-store.md.

`bros run` and `bros shell` exec in container `bros` when it is already up (workdir `$HOME/workspace`). `bros app update <id>` updates a package app or a docker app. Usage: [bros](/docs/cli.md).

## Binds

- `$BROS_DATA_DIR/config/apps` → `/opt/bros/apps`
- `$BROS_DATA_DIR/home` → `/home/bros`
- `$BROS_DATA_DIR/home/nix` → `/nix`
- `$BROS_DATA_DIR/cache/apt/archives` → `/var/cache/apt/archives`
- `$BROS_DATA_DIR/cache/apt/lists` → `/var/lib/apt/lists`
- `$BROS_DATA_DIR/cache/deb` → `/var/cache/bros/debs`
- `$BROS_DATA_DIR/var/logs` → `/var/log/bros`
- `$BROS_WORKSPACE` → `/home/bros/workspace` (default `home/workspace`)
- `$BROS_HOST_REPO` → the same path, read-only (dev mounts the checkout at `/app`)
- Docker socket
- volume `bros-x11` → `/tmp/.X11-unix`
- volume `bros-run` → `/tmp/bros-run`

s6 starts as root so Selkies can start. `PUID` and `PGID` are the desktop user `bros`. Package GUI processes run as that user. The group name stays `abc`.

Hub: [Docker apps](/docs/apps.md).
