# OpenJEV

OpenJEV, Laya, and Verdict run as the host user (`${BROS_HOST_UID:-1000}:${BROS_HOST_GID:-1000}`). `HOME` is `/home/bros`. `HF_HOME` is `/home/bros/.cache/huggingface`.

`/home/bros` is a tmpfs (`mode=1777`) on each service. That scratch home is not stored. All three services share these binds:

- `$BROS_HOST_DATA_DIR/home/.cache/huggingface` → `/home/bros/.cache/huggingface`
- `$BROS_HOST_DATA_DIR/home/.cache/vllm` → `/home/bros/.cache/vllm`
- `$BROS_HOST_DATA_DIR/home/.cache/flashinfer` → `/home/bros/.cache/flashinfer`

Whisper mounts `home/.cache/huggingface/hub` only. OpenJEV mounts the parent cache.
