import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'

describe('Chat markdown copy', () => {
  it('copies fenced snippet and shows copied state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const ProsePre = await import('../../src/layers/theme/app/components/content/ProsePre.vue').then((m) => m.default)
    const wrapper = await mountSuspended(ProsePre, {
      props: { code: 'echo hello', language: 'bash' },
      slots: { default: () => 'echo hello' },
    })

    const btn = wrapper.get('button')
    expect(btn.attributes('aria-label')).toBe('Copy code')
    await btn.trigger('click')
    await nextTick()
    expect(writeText).toHaveBeenCalledWith('echo hello')
    expect(btn.attributes('aria-label')).toBe('Copied')
  })
})
