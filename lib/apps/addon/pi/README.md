# Pi

Addon pack `lib/apps/addon/pi`.

`data/home/.pi` holds Pi state (auth, settings, sessions). It is mounted at `/home/bros/.pi`.

`/home/bros` is an empty tmpfs scratch (`mode=1777`) except that bind.

Shared binds:

- `$BROS_DATA_DIR/home/.pi` → `/home/bros/.pi`

The service runs as the host uid (`${BROS_HOST_UID:-1000}:${BROS_HOST_GID:-1000}`).
