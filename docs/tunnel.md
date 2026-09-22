---
title: Tunnel
description: Host cloudflared named vs quick tunnel, install, login, Status errors.
---

# Tunnel

The Dashboard **Tunnel** card and `/status` control a **host** `cloudflared` process. Bros inside Docker cannot spawn it. It is not a sidecar.

The tunnel exposes the Bros app at `http://127.0.0.1:<BROS_PORT>` (default **3055**). One hostname. Catch-all is `http_status:404`. Sidecar Open/Pin stay `http://127.0.0.1:<publish>/` (LAN) unless the webui has `proxy.public` — then via-tunnel Open/Pin is same-host `/${id}/`. No shipped pack opts in today (OpenCode still serves `/`). Chat, Providers, and Whisper STT on the tunneled URL: the browser calls Bros `/api/*`; Bros calls sidecars via Docker DNS (`http://ollama:11434`, `http://whisper:8000`) on network `bros`.

## Sidecar UIs

Do **not** add extra Cloudflare hostnames or tunnels for sidecars. Path proxy exists only for native-base UIs that set `proxy.public` in `sidecar.yml`. No shipped pack does that until OpenCode honors a base path. Open WebUI and the Ollama API stay LAN — they assume `/` and are not public-proxied. See [Sidecars](/docs/sidecars).

## Prerequisites

A tunnel does not start until both are true:

1. `cloudflared` is on `PATH`, or the binary exists at `~/.local/bin/cloudflared`
2. This host is logged in: `~/.cloudflared/cert.pem` exists, or `cloudflared tunnel list` succeeds

Login is `cloudflared login` (browser authorize; writes `~/.cloudflared/cert.pem`). Bros does not run `cloudflared tunnel login`.

Both named and quick tunnels need install **and** login. Interactive `bros` (or `./bros`) runs a two-stage wizard when the tunnel is enabled and setup is incomplete. Non-interactive starts skip the wizard and write an error for Status.

## Install `cloudflared`

Preferred: let `bros` install a user-local binary (no sudo):

```bash
bros
```

When the tunnel is enabled and `cloudflared` is missing, Stage 1 asks to install. Accept the default **user-local** path (`~/.local/bin`). That downloads the latest GitHub release and `chmod +x`. Alternate: system package/binary (you type the sudo password). Windows prints a PowerShell snippet and waits until the binary is on `PATH`.

Manual user-local (same URLs the wizard uses). Linux `amd64` or `arm64`:

```bash
mkdir -p ~/.local/bin
curl -fL --retry 3 -o ~/.local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x ~/.local/bin/cloudflared
export PATH="$HOME/.local/bin:$PATH"
cloudflared --version
```

macOS user-local (`amd64` or `arm64`):

```bash
mkdir -p ~/.local/bin
curl -fL --retry 3 -o ~/.local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64
chmod +x ~/.local/bin/cloudflared
```

Debian/Ubuntu system install:

```bash
curl -fL --retry 3 -o /tmp/bros-cf.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$(dpkg --print-architecture).deb
sudo dpkg -i /tmp/bros-cf.deb
```

RHEL/Fedora: download `cloudflared-linux-x86_64.rpm` or `cloudflared-linux-aarch64.rpm` from the same releases URL, then `sudo rpm -i`. Other Linux or macOS system install: download the matching binary and `sudo mv` it to `/usr/local/bin/cloudflared`.

Windows (elevated PowerShell):

```powershell
$arch = if ([Environment]::Is64BitOperatingSystem) { "amd64" } else { "386" }
$url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-$arch.exe"
$installDir = "$env:ProgramFiles\cloudflared"
New-Item -ItemType Directory -Force -Path $installDir
Invoke-WebRequest -Uri $url -OutFile "$installDir\cloudflared.exe"
[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "Machine") + ";$installDir", "Machine")
Write-Host "Installation Complete! Restart the terminal and run 'cloudflared --version'."
```

Or install to `%USERPROFILE%\.local\bin` without elevation, then add that folder to Path.

## Login

```bash
cloudflared login
```

Opens a browser so Cloudflare can authorize this host. Success writes `~/.cloudflared/cert.pem`. Status treats login as complete when that file exists **or** `cloudflared tunnel list` succeeds.

`bros` Stage 2 offers this command. Skip it and the tunnel stays off until you run it yourself. The logged-in account must own the DNS zone for a **named** tunnel hostname.

## Named vs quick

When `public_url` is set in `~/.config/bros.yml` (or `bros.yml`) or via `BROS_PUBLIC_URL`:

1. `cloudflared` on `PATH` (or `~/.local/bin/cloudflared`)
2. Login via `~/.cloudflared/cert.pem` or `cloudflared tunnel list`
3. Named tunnel `bros` (`BROS_TUNNEL_NAME`) with `cloudflared tunnel create bros` if missing, `cloudflared tunnel route dns bros <hostname>` (CNAME to `<id>.cfargotunnel.com`), then `cloudflared tunnel --config $BROS_HOME/data/tunnel/config.yml run bros`

`config.yml` uses `protocol: http2` and `edge-ip-version: 4`, hostname ingress to `http://127.0.0.1:<BROS_PORT>`, and a catch-all `http_status:404`. Override with `BROS_TUNNEL_PROTOCOL` / `BROS_TUNNEL_EDGE_IP_VERSION`.

When `public_url` is unset, first interactive `bros` may ask:

```text
Enable Cloudflare tunnel (host cloudflared quick tunnel to :3055)? [y/N]
```

The Dashboard card then starts a **quick** tunnel: `cloudflared tunnel --url http://127.0.0.1:<BROS_PORT>`. Hostname is `*.trycloudflare.com`. A `public_url` whose host is already `*.trycloudflare.com` stays quick (no `route dns`).

Already-exists on `route dns` is success. If `route dns` times out on the Cloudflare API, the tunnel still starts and Status/Dashboard show the CLI warning plus the expected CNAME. If the logged-in account does not own the zone, start fails and the error is written to `status.json`.

## What Status shows

`/status` and the Dashboard card read `$BROS_HOME/data/tunnel/status.json`. They show running, hostname, helper up/down, `installed` yes/no, `login` yes/no, and any `error`.

- **Not installed** — Status: `installed no`. Error: `cloudflared is not installed on the host. Run ./bros in a terminal to install.` Dashboard: `cloudflared not installed (run ./bros)`
- **Not logged in** — Status: `login no`. Error: `cloudflared is not logged in. Run: cloudflared login` Dashboard: `not logged in (run cloudflared login)`
- **Wizard skipped or non-interactive** — `Tunnel enabled but install/login incomplete. Install cloudflared and run: cloudflared login`
- **Helper down** — Dashboard: `helper not running (start with ./bros)`
- **Zone not owned** — `Cloudflare account (cloudflared login) does not own the DNS zone for <host>. Log in to the account that owns that domain, or change public_url.`
- **`route dns` API timeout** — warning in `error`; named tunnel still runs. Confirm CNAME `<host> → <id>.cfargotunnel.com`, or retry `cloudflared tunnel route dns bros <host>`
- **Runtime after register** — last connection error after the most recent successful register (for example a QUIC idle timeout) is shown even while the process is up

Turning the card off stops the process until the next `bros` / helper start. `POST /api/tunnel/start` fails with `Tunnel helper is not running. Start Bros with ./bros so the host can spawn cloudflared.` when the helper is down.

## Helper files

`bros` (and `pnpm dev`) start a small helper that writes:

```text
$BROS_HOME/data/tunnel/
  enabled
  hostname
  status.json
  logs.txt
  command
  config.yml
```

## Config and env

`public_url` in bootstrap YAML (or `BROS_PUBLIC_URL`) is the enable + hostname signal. Unset `public_url` does not autostart; the first-run prompt or the Dashboard card writes `$BROS_HOME/data/tunnel/enabled`.

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_PUBLIC_URL` | unset | Named tunnel hostname (overrides YAML) |
| `BROS_PORT` | `3055` | App port the helper targets |
| `BROS_TUNNEL_PROTOCOL` | `http2` | `http2` / `quic` / `auto` |
| `BROS_TUNNEL_EDGE_IP_VERSION` | `4` | `4` / `6` / `auto` |
| `BROS_TUNNEL_HOST` | unset | Extra Host match for via-tunnel detection |
| `BROS_TUNNEL_NAME` | `bros` | Named tunnel name |
| `BROS_TUNNEL_DIR` | `$BROS_HOME/data/tunnel` | Helper files |
| `BROS_TUNNEL_ROUTE_TIMEOUT` | `20` | Seconds for `cloudflared tunnel route dns` |

Full `BROS_*` list: [Environment](/docs/environment).

## Via-tunnel lock

A request is via-tunnel when any of `cf-ray`, `cf-connecting-ip`, or `cf-visitor` is present, `cdn-loop` contains `cloudflare`, or Host matches `public_url` / `BROS_TUNNEL_HOST` / last advertised hostname. While via-tunnel, stop is refused (API 403) and the Dashboard toggle is disabled.

## `pnpm dev` CSS-as-JS cache

`pnpm dev` behind the tunnel must keep Vite client modules bootable. Vite serves one `.css` path as `text/css` (`<link>`) or `text/javascript` (JS import). Cloudflare caches that path (query string ignored), so a stylesheet body can be reused for the module import and Nuxt never hydrates. Dev rewrites CSS module imports to `/_nuxt/bros-mod/…*.js` and sends `CDN-Cache-Control: no-store` on Vite `/_nuxt` assets. Production hashed CSS is not affected.
