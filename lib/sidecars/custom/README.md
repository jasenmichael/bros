# Custom sidecars

Packs you add live in this directory. One directory per sidecar: `lib/sidecars/custom/<id>/`. The directory name matches `id` in `sidecar.yml`. Each pack has `sidecar.yml` and `docker-compose.yml`.

Add sidecar on `/sidecars` writes those two files here. From a repo clones into `lib/sidecars/custom/<name>/` and loads that tree’s `sidecars/` directory. Only this README is in git. Pack files stay on disk.

Copy a real pack from [lib/sidecars/core](../core) (Ollama, Whisper, Desktop) or [lib/sidecars/addon](../addon) (Pi, OpenCode, Firecrawl, and the rest). Rules: [docs/sidecars/custom.md](../../../docs/sidecars/custom.md).

## Example

`lib/sidecars/custom/hello/sidecar.yml`:

```yaml
id: hello
slug: hello
name: Hello
description: Example web UI.

interfaces:
  - type: webui
    service: hello
    containerPort: 8080
    publish: 3090
    slug: hello
```

`lib/sidecars/custom/hello/docker-compose.yml`:

```yaml
services:
  hello:
    image: example/hello:latest
    user: "${BROS_HOST_UID:-1000}:${BROS_HOST_GID:-1000}"
    ports:
      - "${BROS_HELLO_PORT:-3090}:8080"
    volumes:
      - ${BROS_HOST_DATA_DIR:?unset}/sidecars/hello/data:/data
    restart: unless-stopped
    networks:
      - bros

networks:
  bros:
    external: true
```

A CLI pack uses `type: cli` with `command` and `bin` instead of `publish`. See Pi.

Host ports 3000 and 8080 are forbidden.

## Data

One host directory per container directory under `$BROS_HOST_DATA_DIR/sidecars/<id>/`. Files sit in that directory. The compose line above mounts `sidecars/hello/data` at `/data`.

Shared binds, when the pack needs them:

- `$BROS_HOST_WORKSPACE` → `$HOME/workspace` when the pack lists that path
- `$BROS_HOST_DATA_DIR/home/.agents` → the container’s `.agents`
- Desktop `$PATH` includes `$HOME/.local/sidecar-bins` for a `cli` interface
- `$BROS_HOST_DATA_DIR/config/apps` → `/opt/bros/apps`

`$BROS_HOST_DATA_DIR/var` is the Bros tunnel and logs. Sidecar data is not stored there.
