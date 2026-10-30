---
title: Agents
description: The /agents job board. Issues, approvals, and a Desktop runtime.
---

# Agents

`/agents` is the job board. Dock label **Agents**, after New chat. There is no `/agent` route and no redirect. Chat at `/chat` stays one completion.

Columns: **Issues**, **Needs you**, **Queue**, **Failed**, **Completed**. The page polls about every 2 seconds. **Look in** shows the event transcript. There is no `/jobs/:id` page and no `/projects` page.

A **project** is one git directory directly under Workspace. The directory name is the repo name. **Add project** on `/agents`, under the board, registers `owner/name`, the default branch, and a path. Empty path uses `/home/bros/workspace/<repo>`. A path outside Workspace is rejected. If that directory is missing, Bros clones the GitHub repo into it once. It does not `git init`. The board scans enabled projects only. **Remove** deletes the row, not the directory.

**Issue branch to** is stored on the project. Default `staging`. The issue branch `{kind}/{slug}` is the pull request head.

- `staging` opens the job pull request into `staging`, and keeps one standing pull request `staging` into `main`.
- `main` opens the job pull request into `main`. No standing `staging` pull request.

Bros never merges. **Delete branch after merge** (default on) deletes the job branch after a human merges it. It does not delete `main` or `staging`.

## Flow

**Auto preflight** (default on) enqueues PreFlight about every 30 seconds. **start preflight** still works when that is off. PreFlight uses the Bros Ollama docker app and the selected preflight model. It writes a Task Spec. Auto preflight accepts that spec. Otherwise the job waits on Needs you.

**Approve implement** (or **Auto-approve implement**, default off) runs the selected runtime in the background inside Desktop. The cwd is `/home/bros/workspace/<repo>`. If that directory is missing, Bros clones the GitHub repo into it once, then checks out the issue branch there. No second clone. No git worktree. The agent does not commit, push, or open the pull request. Bros commits, pushes, and stops at `awaiting_pr`. The commit subject Bros writes is `{kind}: {title}` (`bug` is `fix`, `feature` is `feat`). That subject is what the version scanner reads after tag `v0.0.1` exists. Until that tag exists, the scanner does not bump.

**Approve PR** (or **Auto-approve PR**, default off) opens the pull request. One open job per project and issue. The branch starts from that repo's default branch. The commit author is the GitHub user for the token. If that lookup fails, the job fails. Timeout is 45 minutes. Implement retries twice. A completed job whose pull request closes without merge puts the issue back on the board. A merged pull request stays completed. **Clear** deletes a failed or timed out row, not the repo.

## Runtime

One runtime for every project. Default Cursor.

Cursor runs `cursor-agent acp` from the Desktop home (`~/.local/bin/cursor-agent`). When that file is missing, Bros installs it as the desktop user before the first job. The Agents page does not enable the Agent app. See [Agent](/docs/apps/agent).

Claude runs the Claude addon. `kind: run` installs on a Desktop rebuild. The page says so and links to `/apps`. See [Claude](/docs/apps/claude).

## GitHub token

One token, stored encrypted. The field shows set / last 4. Paste replaces. Clear removes it. On every start, a set `GH_TOKEN`, else `GITHUB_TOKEN`, else `GITHUB_PAT`, replaces the stored token. An unset variable leaves a pasted token in place.

The same token is a mode `0600` git credential for `https://github.com` under the Desktop home. The desktop user's credential helper is that store. Bros does not install `gh` and does not run `gh auth login`. The token is not exported into the desktop session or the Compose environment.

## Settings

Under Add project, **Runtime** starts closed. Open it for the runtime, optional Cursor API key, GitHub token, preflight model (models already on the Bros Ollama docker app), Auto preflight, Auto-approve implement, Auto-approve PR, and Delete branch after merge.

HTTP: [API](/docs/api).
