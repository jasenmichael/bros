# Implementation Plan: Custom provider Save success UX

## Overview

Add-custom Save must upsert, toast that the provider was added, and close the modal. Today a second Add with the same custom id sets `id is reserved` on the page banner behind the dialog (looks like a no-op). Real API errors are also hidden behind the modal.

## Root cause

1. Client blocks any id already in `listedProviders`, including existing custom rows. Server POST already upserts.
2. Failure messages use page-level `err` covered by the modal.
3. Success closes the modal but never tells the user.

## Architecture Decisions

- Block only built-in / popular ids on Add. Existing custom id → POST upsert.
- Success: `useToast()` + `closeSettings()` (pattern from Apps).
- Failures: show `err` inside the modal body.

## Assumptions

1. Toast title: Add → `Provider added`; edit → `Provider saved`.
2. `smart-gateway` already in DB; Save again should refresh that row and close.

## Task List

### Phase 1
- [x] Task 1: Upsert custom on Add, toast + close on success, modal-visible errors

### Checkpoint: Complete
- [x] Nuxt test: duplicate custom id saves (mocked $fetch), toast path / modal closes; reserved popular id shows error in dialog
- [ ] Manual: Add `smart-gateway` again → toast + modal closes; row still under Custom providers
