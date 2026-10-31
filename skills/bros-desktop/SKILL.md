---
name: bros-desktop
description: >-
  Use Bros Desktop (Selkies /desktop), Terminal (/terminal), Drawer, and pinned
  launchers. Use when opening GUIs, pins, desktop entries, or debugging the bros
  container session.
---

# Desktop / Terminal / Drawer

Docs: `$BROS_DIR/docs/desktop.md` + `desktop-gui.md` first, else GitHub.

## Concepts

| Term | Meaning |
|------|---------|
| **Desktop** | Wayland session inside container `bros`; stream at `/desktop` (Selkies) |
| **desktop user** | User `bros` in that container (`HOME=/home/bros`) |
| **Terminal** | `/terminal` — same user; Expose CLIs listed there |
| **Workspace** | `/home/bros/workspace` inside Desktop |
| **desktop entry** | Freedesktop launcher record — not an app |
| **pinned launcher** | Library app kept on the Drawer — not a package install |

**Avoid:** “Drawer” as shelf; “runner CLI”; “desktop app” for entries.

Stream / ttyd ports are localhost-only on the host path Bros wires; do not treat them as public without `bros-tunnel`.

## GUI launch

| Kind | Behavior |
|------|----------|
| Package `gui` | Library / Drawer when enabled; click runs `desktop-gui.sh` with no `--container` |
| Docker `gui` | Does **not** start the container; container must already be running; then `desktop-gui.sh start <id> --container …` |

Pin in nav is only for published `webui`. Docker `cli` wrappers live under `data/home/.local/app-bins` on Desktop PATH while the pack runs.

## API

Drawer, pins, icons, open/close GUI, focus, entry — under `/api/desktop/*` (session or proxy-key). See `bros-api`.

Install package GUIs: `bros-package-app`. Start docker apps first: `bros-api` / Apps UI.
