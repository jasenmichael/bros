---
title: Whisper sidecar
description: Local speech-to-text on host port 8090 for Chat voice to text.
---

# Whisper sidecar

Shipped **addon** package `sidecars/whisper`. Speaches (faster-whisper) HTTP STT for the Chat mic. Enabled by default. Disable autostart with `BROS_SIDECAR_WHISPER=0` or `BROS_SIDECARS_DISABLE=whisper`. Still listed under Addon sidecars with source **bros**. Not a Chat provider.

## Ports

- Container: **8000**
- Host publish: **8090** (`BROS_WHISPER_PORT` override)

Open uses `http://127.0.0.1:8090/` (HTTP API). No Pin (no `webui`). Compose-app Bros (Chat STT) and other containers use `http://whisper:8000` on network `bros`. Host Node (`pnpm app:dev`) uses `http://127.0.0.1:8090` (`BROS_WHISPER_PORT` override).

Chat `POST /api/chat/transcribe` (session cookie) forwards a short audio clip to `POST /v1/audio/transcriptions`. Empty speech returns `{ text: "" }`. If the pack is down, that handler starts it, then waits on `/health`. First use can be slow (image + model download). Default model is `Systran/faster-whisper-base` on CPU.

## Binds

- `$BROS_HOST_DATA_DIR/whisper` → `/home/ubuntu/.cache/huggingface/hub`

Compose runs Speaches as root (`user: "0:0"`, `HOME`/`HF_HOME` under `/home/ubuntu`) so that bind is writable when Docker creates the host dir as root.

Hub: [Sidecars](/docs/sidecars).
