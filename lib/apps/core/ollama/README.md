# Ollama docker app

The service runs as the host uid (`${BROS_HOST_UID:-1000}:${BROS_HOST_GID:-1000}`).

| Host directory | Contents | Container path |
| --- | --- | --- |
| `$BROS_DATA_DIR/home/.ollama` | Ollama home, including downloaded models under `models/blobs` and `models/manifests` | `/home/bros/.ollama` |
| `$BROS_DATA_DIR/home/.config/ollama` | Ollama config | `/home/bros/.config/ollama` |
| `$BROS_DATA_DIR/apps/ollama/bros-model` | Packaged `bros` model tree | `/bros-model` (read-only) |
| Host home (`${BROS_HOST_HOME_BIND:-$HOME}`) | Host home directory | `/host-home` (read-only) |
