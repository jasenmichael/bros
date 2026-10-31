# Desktop

Selkies desktop, package installs, and the terminal. The container process is root. The `/terminal` shell and package GUI processes are the desktop user `bros` at `PUID`/`PGID`, with prompt `bros@bros:~/workspace$`. Passwd also lists `abc` for that uid.

## Mounts

Host paths are under the Bros data directory (`BROS_DATA_DIR`).

- `home` → `/home/bros` (Desktop `$HOME`)
- `BROS_WORKSPACE` → `/home/bros/workspace` (default `home/workspace`)
- `config/apps` → `/opt/bros/apps`

`$HOME/.local/app-bins` is first on `PATH`. App `launch.sh` wrappers are written there. Desktop does not bind a second bin directory.

Named volumes (external):

- `bros-x11` → `/tmp/.X11-unix`
- `bros-run` → `/tmp/bros-run`
