---
name: bros-agents
description: >-
  Run the Bros Agents job board (GitHub issue → preflight → implement → PR). Use
  when working /agents, Task Spec, Workspace/repos, PR base, or cursor-agent
  runtime — not Chat, and not the Agent package app alone.
---

# Agents page

UI: `/agents`. Docs: `$BROS_DIR/docs/agents.md` (else GitHub). API: `/api/agents*`.

**Avoid:** “Agent page”, “worktree”. Chat (`/chat`) is a different surface. The **Agent app** is the addon that installs `agent` / `cursor-agent` — enable it via `bros-package-app` if the runtime binary is missing.

## Glossary

| Term | Meaning |
|------|---------|
| **Workspace** | Desktop cwd; host `BROS_WORKSPACE` or `bros.yml` `workspace` or `data/home/workspace`; inside Desktop `/home/bros/workspace` |
| **Repo** | One git directory under Workspace (also called a project) |
| **Issue** | GitHub issue on that repo |
| **Job** | One run: preflight → implement → PR |
| **Task Spec** | Plan PreFlight writes; user can edit before implement |
| **Issue branch** | `{kind}/{slug}` — PR head |
| **PR base** | Per repo `staging` or `main` (default `staging`) |
| **GitHub token** | Set on Agents page; startup may replace from `GH_TOKEN` / `GITHUB_TOKEN` / `GITHUB_PAT` |

## Board

Columns: Issues, Needs you, Queue, Failed, Completed. Add project under the board. Runtime panel closed until opened.

Runtime binary: Desktop `cursor-agent` (from Agent app / Cursor install under Desktop home). Approve implement before the runtime proceeds.

Auth for API calls: session cookie or Bearer proxy-key (`bros-api`). Desktop session: `bros-desktop`.
