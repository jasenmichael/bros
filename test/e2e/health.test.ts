import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

// Hit the running pnpm dev server. Isolated Nuxt spawn fights host Node ABI
// (better-sqlite3) and container volumes (NUXT_B8006).
describe('health', async () => {
  await setup({
    host: 'http://127.0.0.1:3055',
    server: false,
    browser: false,
  })

  it('returns ok from /api/health', async () => {
    const body = await $fetch<{ ok: boolean; service: string }>('/api/health')
    expect(body.ok).toBe(true)
    expect(body.service).toBe('bros')
  })
})
