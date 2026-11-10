# Todo: Package fatal-clear + Unsloth docker custom

## Task 1: Remove deb package unsloth

**Acceptance criteria:**
- [x] `unsloth` not in `running.json` ids
- [x] `DELETE /api/cli/packages/unsloth` succeeds (or dir already gone)
- [x] No `data/config/apps/unsloth/config.yml` with `kind: deb`

**Verification:** `curl … /api/cli/packages` has no unsloth; dir absent or empty before recreate

**Dependencies:** None  
**Files:** `data/config/apps/running.json`, package tree via API  
**Scope:** XS

---

## Task 2: Create docker custom unsloth

**Acceptance criteria:**
- [x] `data/config/apps/unsloth/{config.yml,docker-compose.yml}` exist, `kind: docker`
- [x] webui publish 8888; compose maps `${BROS_UNSLOTH_PORT:-8888}:8888` (+ 8000, 2222)
- [x] `gpus: all`; work volume under `data/apps/unsloth/work`
- [x] `JUPYTER_PASSWORD` from `UNSLOTH_JUPYTER_PASSWORD`

**Verification:** `GET /api/apps` shows custom docker unsloth

**Dependencies:** Task 1  
**Scope:** S

---

## Task 3: Local env + start

**Acceptance criteria:**
- [x] `.env` has `UNSLOTH_JUPYTER_PASSWORD` if missing (gitignored)
- [x] `POST /api/apps/unsloth/start` attempted (pull may take time; image pull still running)

**Dependencies:** Task 2  
**Scope:** XS

---

## Checkpoint: Unsloth
- [ ] Listed as docker custom; Open targets 8888

---

## Task 4: Fatal clear in supervise

**Acceptance criteria:**
- [ ] Exit 126/127 clears id from running.json, no relaunch
- [ ] Pure helpers exported

**Files:** `lib/desktop/app-services/supervise.ts`  
**Dependencies:** None (parallel with Phase 1)  
**Scope:** S

---

## Task 5: Unit tests

**Verification:** `pnpm --dir app --filter @bros/ui exec vitest run ../../test/unit/desktop-apps.test.ts`  
**Dependencies:** Task 4  
**Scope:** XS

---

## Task 6: Docs

**Files:** `docs/desktop.md`, maybe `docs/apps.md`  
**Dependencies:** Task 4  
**Scope:** XS

---

## Checkpoint: Complete
- [ ] Tests pass; no `data/` in intentional commit
