# Whisper

`hub` holds the Hugging Face model cache for Speaches (faster-whisper weights).

`${BROS_DATA_DIR}/home/.cache/huggingface/hub` → `/home/bros/.cache/huggingface/hub`

The service runs as the host uid and gid (`${BROS_HOST_UID:-1000}:${BROS_HOST_GID:-1000}`).
