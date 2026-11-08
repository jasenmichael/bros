# Implementation Plan: Custom providers like Popular (+ Chat model list)

## Overview

1. Providers: Custom rows need Popular-style expand (model list + per-model Chat + inline Save).
2. Chat: Switching to a custom provider with no `p.models` keeps the previous `modelName` and `modelItems` falls back to that stale name — looks like “last provider’s models,” nothing real to pick.

## Root cause

- Custom UI is flat (gear only); Popular uses expand + `openaiModelNames`.
- Chat `modelItems`: if `modelsForProvider(pid)` is empty, return `[modelName]` — leak from prior provider. `watch(providerId)` only assigns when `names.length`.

## Architecture Decisions

- Custom expand matches Popular (chevron, model Chat switches, inline form + Delete). Add modal stays.
- Chat: empty provider models → empty picker (no stale fallback). On provider switch with empty list, clear `modelName`.
- Probe 404→Ready WIP stays in this branch (already in tree).
- Bros-only. No other repos. Do not change smart-gateway port.

## Assumptions

1. Live `GET /models` merge into configured names stays (e.g. `gpt-4o-mini` + `openai/gpt-4o-mini`).
2. “Like other providers” = Popular OpenAI-compat cards, not Ollama pull.

## Task List

### Phase 0
- [ ] Task 1: Commit GET `/models` 404 → Ready (+ tests/SPEC/docs)

### Phase 1
- [ ] Task 2: Custom expand UI like Popular
- [ ] Task 3: Chat — no stale modelItems when provider has no models; clear model on switch

### Phase 2
- [ ] Task 4: Nuxt/unit tests + docs line for custom expand + Chat empty list

### Checkpoint
- [ ] Custom expands with model rows
- [ ] Switch to empty-model custom → Chat model menu empty (not prior provider names)
- [ ] Tests green

## Out of scope

- Other repos, Ollama pull on custom, port edits
