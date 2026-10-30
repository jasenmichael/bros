# Open WebUI

`data` holds WebUI state and the secret key file (`.webui_secret_key`).

`${BROS_HOST_DATA_DIR}/sidecars/openwebui/data` → `/app/backend/data`

The service runs as the host uid and gid (`${BROS_HOST_UID:-1000}:${BROS_HOST_GID:-1000}`).
