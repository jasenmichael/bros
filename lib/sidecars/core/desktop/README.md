# Desktop

Selkies desktop, package installs, and the terminal. The container process is root. The `/terminal` shell and package GUI processes are the desktop user `bros` at `PUID`/`PGID`, with prompt `bros@bros:~/workspace$`. Passwd also lists `abc` for that uid.

## Mounts

Host paths are under the Bros data directory (`BROS_HOST_DATA_DIR`).

- `home` → `/home/bros` (Desktop `$HOME`)
- `BROS_HOST_WORKSPACE` → `/home/bros/workspace` (default `home/workspace`)
- `config/apps` → `/opt/bros/apps`

`$HOME/.local/sidecar-bins` is first on `PATH`. Sidecar CLI wrappers are written there. Desktop does not bind another sidecar directory.

Named volumes (external):

- `bros-x11` → `/tmp/.X11-unix`
- `bros-run` → `/tmp/bros-run`
