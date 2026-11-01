---
title: Ollama
description: Core docker Ollama app, ports, GPU, host provider, internal bros model.
---

# Ollama

Must-run **core** docker app `lib/apps/core/ollama`. Local model runtime. Independent of the Bros app container.

## Ports and DNS

- Container listen: **11434**
- Host publish: **11435** (`BROS_OLLAMA_PORT` override)
- Docker DNS for other containers **and** Compose-app Bros (Chat/Providers): `http://ollama:11434`
- Host Node (`pnpm --dir app ui:dev`): `http://127.0.0.1:11435` (`BROS_OLLAMA_PORT` override)

Host publish stays **11435** so a host Ollama on 11434 can coexist. Chat/Providers provider id is `ollama`. Home, Status, and Apps cards show that publish port only. Host Ollama is not labeled on those surfaces.

## Always on

Core Ollama is the only must-run docker app this pass. Whisper is also core and stays stopped until Settings enables it. Bros starts Ollama on app start and keeps it up. Apps / Status / Home have no Start, Stop, Restart, or Autostart. There is no disable env (Settings disable may come later). `POST /api/apps/ollama/start`, `…/stop`, and `…/restart` return 400. GPU apply still recreates the container internally.

A server health check every 15s looks at compose running state and `GET /api/version` (5s timeout). It skips the check during autostart and while Ollama is starting. Process down calls `startDocker app` on that tick. Two failed version probes in a row call `restartDocker app`. A single slow pull or a single slow probe does not. Restarts are debounced (30s). `/api/status` includes `ollamaRestartNotice` `{ recoveredAt, lastRestartReason }`; the app toasts once per recovery: Ollama crashed or became unresponsive and Bros restarted it.

Host Ollama (`ollama-host`) is a separate provider. Bros does not stop or restart that host daemon.

## Binds

Compose runs Ollama as `BROS_HOST_UID`:`BROS_HOST_GID`. `$HOME` is `/home/bros`. Ollama reads `$HOME/.ollama`.

- `$BROS_DATA_DIR/home/.ollama` → `/home/bros/.ollama` (downloaded models)
- `$BROS_DATA_DIR/home/.config/ollama` → `/home/bros/.config/ollama`
- `$BROS_DATA_DIR/apps/ollama/bros-model` → `/bros-model` (read-only packaged tree)

GPU: if an NVIDIA GPU is present, open the docker app card on Providers and enable **Use GPU** under the installed-model list to restart with the GPU compose override. Host Ollama cannot configure GPU from Bros. Installed docker app and host models each have a Chat switch and a confirm-before-delete ban icon. Off hides that model from Chat only. Compose (and the GPU override) set **`OLLAMA_NOPRUNE=1`** so incomplete pulls survive.

## Host Ollama

Host Ollama is a **separate** Chat/Providers provider (`ollama-host`). Settings **Enable host Ollama** is **off by default**. Off hides the row from Chat/Providers and 404s `/api/providers/ollama-host/*`. The SQLite row stays. Bros never starts the host daemon.

When on, live scan looks for one daemon: optional Providers port override (`host_probe_port`, exclusive, no silent fallback); else probe default **11434** first via `dockerHostCandidates()` (`host.docker.internal` / `BROS_HOST_GATEWAY` from the app container, `127.0.0.1` on host Node). Skip if that port is docker app publish **11435** or `bros-ollama`. Then published host ports on running Docker Ollama containers (image `ollama/ollama` or name containing `ollama`; skip project/name `bros-ollama` and publish **11435**). Then leftover `/proc/net/tcp`+`tcp6` LISTEN ports on `pnpm --dir app ui:dev` and other published ports. In the app container, host `/proc` is invisible — still probe host-gateway **11434**, not only the container listen table. Verify with `GET /api/version` JSON `{ version }`. First `GET /api/version` hit wins. `POST /api/providers/ollama-host/scan` busts the 30s cache. Do not HTTP-probe 1–65535. No extra packages (dockerode + `/proc`). Docker socket is already required; host Node needs readable `/proc/net/tcp`.

Pull and chat on the host provider use the **host Ollama disk**. Docker app pull and chat use `$BROS_DIR/data/home/.ollama`. Run the host daemon with `OLLAMA_NOPRUNE=1` (Bros cannot set host daemon env) so incomplete host pulls are not pruned.

## Internal `bros` model

On a source checkout, first docker app up copies the packaged GGUF tree from `vendor/bros-model` onto `$BROS_DATA_DIR/apps/ollama/bros-model` and runs `bash /bros-model/scripts/install-ollama.sh` inside `bros-ollama` (`ollama create bros`). A release tarball does not ship `vendor/`. Install and `bros update` read `lib/apps/core/ollama/BROS_MODEL_VERSION` (`1.0.0` with product version `0.0.1`) and download that release into the same data directory when the local stamp is missing or older. A newer local stamp stays. `bros` start does not download. The create still runs inside `bros-ollama`. Desktop and `bros-ui` do not run `ollama create`. Missing GGUF skips quietly and does not create the model. A model already stored under `data/` survives `bros update`. Used for Chat auto-title. **Not listed** in Chat or Providers. Pull/delete of the reserved name returns 400. Source: [jasenmichael/bros-model](https://github.com/jasenmichael/bros-model).

See [Providers — Ollama](/docs/providers/ollama.md).
