# OpenCode

Addon sidecar. Image `ghcr.io/anomalyco/opencode:2.0.32`. Command is `serve --hostname 0.0.0.0 --port 4096`. Published host port is `${BROS_OPENCODE_PORT:-4097}`. Working directory is `/home/bros/workspace` only when the pack lists `workspace`. Restart policy is `unless-stopped`. Network `bros` is external.

The service user is the host uid and gid: `${BROS_HOST_UID:-1000}:${BROS_HOST_GID:-1000}`. `HOME` is `/home/bros`. There is no passwd entry for that uid. Without `HOME`, Docker sets `HOME=/` and Bun exits.

## Scratch home

`/home/bros` is a tmpfs, mode `1777`. It is empty scratch and is not stored. Nested binds hold the stored directories. Mode `1777` lets the host uid create `.cache` on that scratch home.

## Mounts

Host paths are under `${BROS_HOST_DATA_DIR}`.

- `data/home/.config/opencode` → `/home/bros/.config/opencode`
- `data/home/.local/share/opencode` → `/home/bros/.local/share/opencode`
- `data/home/.local/state/opencode` → `/home/bros/.local/state/opencode`
