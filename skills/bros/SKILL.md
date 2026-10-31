---
name: bros
description: >-
  Orients agents to Bros (Boxed Runtime Orchestration System): glossary,
  contract docs, doc lookup, and which sibling skill to load. Use when the user
  mentions Bros, $BROS_DIR, /apps, Desktop, or Bros Chat/Agents.
---

# Bros

**Bros** = Boxed Runtime Orchestration System. Docker control plane for local AI apps (Chat, Providers, Apps) plus a browser Desktop (Selkies). CLI is `bros` (default action: start). UI: `http://127.0.0.1:3055`.

Install: `curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash` → `$BROS_DIR` / `$BROS_DIR` (usually `~/.bros`), symlink `~/.local/bin/bros`.

## Doc resolution

1. If `$BROS_DIR/docs` or `$BROS_DIR/docs` exists, read that tree first.
2. Else use https://github.com/jasenmichael/bros/tree/main/docs (raw: `https://raw.githubusercontent.com/jasenmichael/bros/main/docs/...`).
3. When Bros is up: OpenAPI at `http://127.0.0.1:3055/openapi.yaml`.

Glossary: product word is **app**. Prefer [GLOSSARY.md](https://github.com/jasenmichael/bros/blob/main/GLOSSARY.md).

**Avoid:** “Agent page” (use Agents page), “worktree” (use Repo), “runner CLI” (UI runner ≠ CLI), Drawer ≠ shelf.

## Chat ≠ Agents ≠ Agent app

| Term | Meaning |
|------|---------|
| **Chat** | `/chat` — one streamed completion |
| **Agents page** | `/agents` — GitHub issue → job → PR board |
| **Agent app** | Addon that installs `agent` / enables `cursor-agent` under Desktop |

## Sibling skills

| Skill | Load when |
|-------|-----------|
| `bros-create-app` | Add/wire an app; docker pack authoring |
| `bros-package-app` | Package kinds (npm/deb/run/…) inside Desktop |
| `bros-api` | Curl/script `/api/*`, proxy-key auth |
| `bros-cli` | Start/stop/update/run/shell |
| `bros-dev` | Editing the `jasenmichael/bros` checkout |
| `bros-agents` | Agents board / Task Spec / jobs |
| `bros-desktop` | Desktop stream, Terminal, Drawer, pins |
| `bros-tunnel` | cloudflared, path proxies, Override Base URL |

Checkout contract (see `bros-dev`): SPEC > STACK > DESIGN > PLAN > README.

Not these skills: in-app Chat prompts under `lib/skills/` (`personality`, `rules`, …).
