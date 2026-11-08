# Todo: Custom provider Save success UX

## Task 1: Save toast, close modal, upsert custom

**Description:** On successful custom provider Save, toast and close the add/edit modal. Allow Add to upsert an existing custom id. Keep blocking popular/system ids. Show Save errors inside the modal.

**Acceptance criteria:**
- [x] Successful Add closes modal and shows a toast that the provider was added
- [x] Successful edit closes modal and shows a saved toast
- [x] Add with an existing custom id upserts (does not silent-fail)
- [x] Add with a popular/system id shows an error inside the dialog
- [x] API Save failure message appears inside the dialog

**Verification:**
- [x] `pnpm --dir app --filter @bros/ui exec vitest run ../../test/nuxt/providers-page.test.ts`
- [ ] Manual: Add custom `smart-gateway` → toast + modal closes

**Dependencies:** None

**Files likely touched:**
- `app/ui/components/SettingsProviders.vue`
- `test/nuxt/providers-page.test.ts`

**Estimated scope:** S
