---
title: Ollama sidecar
description: Core Ollama package, ports, GPU, host provider, internal bros model.
---

# Ollama sidecar

Must-run **core** package `sidecars/ollama`. Local model runtime. Independent of the Bros app container.

## Ports and DNS

- Container listen: **11434**
- Host publish: **11435** (`BROS_OLLAMA_PORT` override)
- Docker DNS for other containers **and** Compose-app Bros (Chat/Providers): `http://ollama:11434`
- Host Node (`pnpm app:dev`): `http://127.0.0.1:11435` (`BROS_OLLAMA_PORT` override)

Host publish stays **11435** so a host Ollama on 11434 can coexist. Chat/Providers sidecar provider id is `ollama`. Home, Status, and Sidecars cards show that publish port only. Host Ollama is not labeled on sidecar surfaces.

## Always on

Sidecar Ollama is the only core sidecar. Bros starts it on app start and keeps it up. Sidecars / Status / Home have no Start, Stop, Restart, or Autostart. There is no disable env. `POST /api/sidecars/ollama/start`, `…/stop`, and `…/restart` return 400. GPU apply still recreates the container internally.

A server health check every 15s looks at compose running state and `GET /api/version`. Process down or a failed version probe (not a single slow pull) calls `startSidecar` / `restartSidecar`. Restarts are debounced (30s). `/api/status` includes `ollamaRestartNotice` `{ recoveredAt, lastRestartReason }`; the app toasts once per recovery: Ollama crashed or became unresponsive and Bros restarted it.

Host Ollama (`ollama-host`) is a separate provider. Bros does not stop or restart that host daemon.

## Binds

- `$BROS_HOST_DATA_DIR/ollama` → `/root/.ollama`
- `$BROS_HOST_DATA_DIR/ollama-config` → `/root/.config/ollama`
- `$BROS_HOST_DATA_DIR/bros-model` → `/bros-model:ro` (packaged specialist)

GPU: if an NVIDIA GPU is present, open the sidecar card on Providers and enable **Use GPU** under the installed-model list to restart with the GPU compose override. Host Ollama cannot configure GPU from Bros. Installed sidecar and host models each have a Chat switch and a confirm-before-delete ban icon. Off hides that model from Chat only. Compose (and the GPU override) set **`OLLAMA_NOPRUNE=1`** so incomplete pulls survive.

## Host Ollama

Host Ollama is a **separate** Chat/Providers provider (`ollama-host`). Settings **Enable host Ollama** is **off by default**. Off hides the row from Chat/Providers and 404s `/api/providers/ollama-host/*`. The SQLite row stays. Bros never starts the host daemon.

When on, live scan looks for one daemon: optional Providers port override (`host_probe_port`, exclusive, no silent fallback); else probe default **11434** first via `dockerHostCandidates()` (`host.docker.internal` / `BROS_HOST_GATEWAY` from the app container, `127.0.0.1` on host Node). Skip if that port is sidecar publish **11435** or `bros-sc-ollama`. Then published host ports on running Docker Ollama containers (image `ollama/ollama` or name containing `ollama`; skip project/name `bros-sc-ollama` and publish **11435**). Then leftover `/proc/net/tcp`+`tcp6` LISTEN ports on `pnpm app:dev` and other published ports. In the app container, host `/proc` is invisible — still probe host-gateway **11434**, not only the container listen table. Verify with `GET /api/version` JSON `{ version }`. First `GET /api/version` hit wins. `POST /api/providers/ollama-host/scan` busts the 30s cache. Do not HTTP-probe 1–65535. No extra packages (dockerode + `/proc`). Docker socket is already required; host Node needs readable `/proc/net/tcp`.

Pull and chat on the host provider use the **host Ollama disk**, not `$BROS_HOME/data/ollama`. Sidecar pull/chat use the sidecar bind (still on the host under `$BROS_HOME/data/ollama`). Run the host daemon with `OLLAMA_NOPRUNE=1` (Bros cannot set host daemon env) so incomplete host pulls are not pruned.

## Internal `bros` model

On first sidecar up, Bros copies the packaged GGUF tree onto `$BROS_HOST_DATA_DIR/bros-model` and runs `bash /bros-model/scripts/install-ollama.sh` inside `bros-sc-ollama` (`ollama create bros`). Used for Chat auto-title. **Not listed** in Chat or Providers. Pull/delete of the reserved name returns 400. Source: [jasenmichael/bros-model](https://github.com/jasenmichael/bros-model).

See [Providers — Ollama](/docs/providers/ollama).
