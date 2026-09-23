---
title: Whisper sidecar
description: Local speech-to-text on host port 8090 for Chat voice to text.
---

# Whisper sidecar

Shipped **core** package `sidecars/core/whisper`. Speaches (faster-whisper) HTTP STT for the Chat mic. Stopped until Settings **Enable Whisper** (off by default). Turning the switch on pulls the Whisper images, then starts the sidecar. Turning it off stops the container. Later Bros starts autostart it only while the switch stays on. Listed under Core with source **bros**. No Start, Stop, Restart, or Autostart on Sidecars / Status / Home. Not a Chat provider.

## Ports

- Container: **8000**
- Host publish: **8090** (`BROS_WHISPER_PORT` override)

Open uses `http://127.0.0.1:8090/` (HTTP API). No Pin (no `webui`). Compose-app Bros (Chat STT) and other containers use `http://whisper:8000` on network `bros`. Host Node (`pnpm app:dev`) uses `http://127.0.0.1:8090` (`BROS_WHISPER_PORT` override).

Chat `POST /api/chat/transcribe` (session cookie) forwards a short audio clip to `POST /v1/audio/transcriptions`. Empty speech returns `{ text: "" }`. While Settings leaves Whisper off, the handler returns an error and does not start or pull images. While the switch is on and the container is down, the handler starts it, then waits on `/health`. The image pull happens when the switch is turned on. Default model is `Systran/faster-whisper-base` on CPU.

## Binds

- `$BROS_HOST_DATA_DIR/whisper/home/ubuntu/.cache/huggingface/hub` → `/home/ubuntu/.cache/huggingface/hub`

Compose runs Speaches as root (`user: "0:0"`, `HOME`/`HF_HOME` under `/home/ubuntu`) so that bind is writable when Docker creates the host dir as root.

Hub: [Sidecars](/docs/sidecars).
