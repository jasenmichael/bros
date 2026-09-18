---
title: Configuration
description: Bootstrap YAML, BROS_DIR, and host data binds.
---

# Configuration

## Bootstrap YAML

`working_dir`, `data_dir`, and optional `public_url` belong in YAML. Load order:

1. `BROS_CONFIG` exclusive file, or
2. `.config/bros.yml` then `./bros.yml`
3. Env: `BROS_WORKING_DIR`, `BROS_DATA_DIR`, `BROS_PUBLIC_URL`

```yaml
working_dir: .
data_dir: ./data
public_url: https://bros.example.com
```

`public_url` enables the host Cloudflare tunnel and is the advertised hostname. All other settings live in SQLite (`bros.sqlite`) and the UI.

## `BROS_DIR` and host binds

`BROS_DIR` is the repo checkout when `./bros` sits next to `docker-compose.yml` + `sidecars/`. An installed binary uses `~/.bros`. Override with `BROS_DIR`.

Persistent binds live under `$BROS_DIR/data` (`BROS_HOST_DATA_DIR`):

- `$BROS_HOST_DATA_DIR` → app `/data` (SQLite, custom sidecars, logs)
- `$BROS_HOST_DATA_DIR/ollama` → Ollama `/root/.ollama`
- `$BROS_HOST_DATA_DIR/openwebui` → Open WebUI data
- `$BROS_HOST_DATA_DIR/opencode` → OpenCode workspace

In-container `BROS_DATA_DIR` stays `/data`. `./bros` copies leftover named volumes into empty dest dirs once (does not delete the volumes).

## Data directory layout

```text
$BROS_HOST_DATA_DIR/
  passkey
  bros.sqlite
  sidecars/
  logs/
  tunnel/
  ollama/
  openwebui/
  opencode/
```

Passkey (login passcode) lives in `passkey` — printed at app startup. Providers (including Ollama `config.customModels` and custom OpenAI `config.models`), chat, and sidecar autostart/nav pins/`hostMode`/`host_probe_port` are stored in SQLite. Built-in providers are `ollama` (sidecar) and `ollama-host`.

Compose publish overrides: `BROS_OLLAMA_PORT` (default 11435), `BROS_OPENCODE_PORT` (4097), `BROS_OPENWEBUI_PORT` (3080).

Do not commit `data/`, `.env`, `.nuxt`, or `node_modules`.

## Tunnel (host cloudflared)

The Dashboard Tunnel card controls a **host** `cloudflared` process. Bros inside Docker cannot spawn it. `./bros` / `./bros --dev` start a small helper that writes:

```text
$BROS_HOST_DATA_DIR/tunnel/
  enabled
  hostname
  status.json
  logs.txt
  command
```

When `public_url` is set (or the Dashboard card is on), startup checks:

1. `cloudflared` on `PATH` (or `~/.local/bin/cloudflared`)
2. Login via `~/.cloudflared/cert.pem` or `cloudflared tunnel list`

Missing binary: the wizard offers a **user-local** install to `~/.local/bin` (no sudo). A system package/binary install (`dpkg` / `rpm` / `/usr/local/bin`) is optional and asks you to approve sudo. Native Windows uses the elevated PowerShell snippet in this section, or WSL.

Then run `cloudflared login` in the browser. With `public_url` set, the helper creates/runs a **named** tunnel (`bros`) with `cloudflared tunnel route dns <id> <hostname>` (CNAME to `<id>.cfargotunnel.com`) and `cloudflared tunnel --config $BROS_DIR/data/tunnel/config.yml run bros` (`protocol: http2` and `edge-ip-version: 4` in that YAML; override `BROS_TUNNEL_PROTOCOL` / `BROS_TUNNEL_EDGE_IP_VERSION`). Already-exists is success. If `route dns` times out on the Cloudflare API, the tunnel still starts and Dashboard shows the CLI warning plus the expected CNAME. If the logged-in account does not own the zone, start fails and the error is written to `status.json` (Dashboard + Status). When `public_url` is unset, the card starts a quick tunnel to `http://127.0.0.1:<BROS_PORT>` (default **3055**).

Windows (elevated PowerShell):

```powershell
$arch = if ([Environment]::Is64BitOperatingSystem) { "amd64" } else { "386" }
$url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-$arch.exe"
$installDir = "$env:ProgramFiles\cloudflared"
New-Item -ItemType Directory -Force -Path $installDir
Invoke-WebRequest -Uri $url -OutFile "$installDir\cloudflared.exe"
[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "Machine") + ";$installDir", "Machine")
```

macOS / Linux user-local (preferred, no sudo): `./bros` downloads the official GitHub release into `~/.local/bin`. System install uses the official `.deb` / `.rpm` / `/usr/local/bin` binaries and requires sudo.
