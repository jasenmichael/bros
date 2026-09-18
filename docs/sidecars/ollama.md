---
title: Ollama sidecar
description: Core Ollama package, ports, GPU, host provider, internal bros model.
---

# Ollama sidecar

Core package `sidecars/ollama`. Local model runtime. Independent of the Bros app container.

## Ports and DNS

- Container listen: **11434**
- Host publish: **11435** (`BROS_OLLAMA_PORT` override)
- Docker DNS for other containers: `http://ollama:11434`

Host publish stays **11435** so a host Ollama on 11434 can coexist. Chat/Models sidecar provider id is `ollama`.

## Binds

- `$BROS_HOST_DATA_DIR/ollama` → `/root/.ollama`
- `$BROS_HOST_DATA_DIR/ollama-config` → `/root/.config/ollama`
- `$BROS_HOST_DATA_DIR/bros-model` → `/bros-model:ro` (packaged specialist)

GPU: if an NVIDIA GPU is present, open the sidecar cog on Models and enable **Use GPU** to restart with the GPU compose override. Host Ollama cannot configure GPU from Bros.

## Host Ollama

Host Ollama is a **separate** Chat/Models provider (`ollama-host`), always listed even when the daemon is down. Scan ports 11434, 11436, 22000 with `GET /api/version`, skip `bros-sc-ollama`. Optional manual port on the host card cog.

Pull and chat on the host provider use the **host Ollama disk**, not `$BROS_HOME/data/ollama`. Sidecar pull/chat use the sidecar bind (still on the host under `$BROS_HOME/data/ollama`).

## Internal `bros` model

On first sidecar up, Bros copies the packaged GGUF tree onto `$BROS_HOST_DATA_DIR/bros-model` and runs `bash /bros-model/scripts/install-ollama.sh` inside `bros-sc-ollama` (`ollama create bros`). Used for Chat auto-title. **Not listed** in Chat or Models. Pull/delete of the reserved name returns 400. Source: [jasenmichael/bros-model](https://github.com/jasenmichael/bros-model).

See [Models — Ollama](/docs/models-ollama).
