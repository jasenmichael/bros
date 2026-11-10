# Implementation Plan: Package fatal-clear + Unsloth docker custom

## Overview

Two tracks. (1) Repo — clear package-service desired-on on fatal spawn (126/127). (2) Local — replace custom deb unsloth with docker app `unsloth/unsloth` for Studio webui on 8888.

## Architecture Decisions

- **Desired-on stays.** `serviceRunning` = id in `running.json`. Fatal exit clears it. Independent of Unsloth.
- **Unsloth = Studio webui via Docker**, not Desktop deb/gui. Custom pack under `data/config/apps/unsloth/` (gitignored).
- **Ports:** webui Open on **8888**. Also publish **8000** and **2222** (upstream docker run) without extra Open buttons.
- **Password:** `JUPYTER_PASSWORD` from `UNSLOTH_JUPYTER_PASSWORD` (default `changeme`). Set real value in local `.env` only — never `example.env`.
- **GPU:** `gpus: all` like openjev.

## Assumptions

1. Replace in place: DELETE package `unsloth`, then POST docker custom with same id.
2. Leave Desktop deb bits in container if already installed; optional cleanup later.
3. Do not ship `lib/apps/addon/unsloth` in this change.
→ Correct me if wrong.

## Task List

### Phase 1: Local Unsloth docker
- [ ] Task 1: Clear `unsloth` from `running.json`; DELETE `/api/cli/packages/unsloth`
- [ ] Task 2: POST `/api/apps` docker pack (webui 8888, GPU, work volume)
- [ ] Task 3: Ensure `UNSLOTH_JUPYTER_PASSWORD` in local `.env` if missing; Start app

### Checkpoint: Unsloth
- [ ] `GET /api/apps` lists unsloth as custom docker with webui 8888
- [ ] No package `services` / deb config for that id

### Phase 2: Repo fatal-clear
- [ ] Task 4: supervise fatal-clear helpers + exit path
- [ ] Task 5: unit tests
- [ ] Task 6: docs/desktop.md (+ apps.md if needed)

### Checkpoint: Complete
- [ ] Unit tests pass
- [ ] `data/` not staged for commit

## Risks

| Risk | Mitigation |
|------|------------|
| DELETE package triggers desktop ensure/rebuild | Accept; id removed before docker write |
| Port 8888 already bound | Bros may bump via `BROS_UNSLOTH_PORT` |
| Weak default jupyter password | Document; user sets `.env` |

## Open Questions

None — interview filled from user docker snippet + Studio-vs-Desktop docs.
