import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'

const SAMPLE = `## Heading

A paragraph with \`inline\`.

- item one
- item two

\`\`\`bash
echo hello
\`\`\`

> quoted

| a | b |
| --- | --- |
| 1 | 2 |
`

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

describe('Chat markdown uses docs prose', () => {
  it('renders nothing for empty text', async () => {
    const BrosChatMarkdown = await import('../../src/app/components/BrosChatMarkdown.vue').then((m) => m.default)
    const wrapper = await mountSuspended(BrosChatMarkdown, { props: { text: '   ' } })
    expect(wrapper.find('.bros-prose').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('applies theme .bros-prose and docs structure', async () => {
    const BrosChatMarkdown = await import('../../src/app/components/BrosChatMarkdown.vue').then((m) => m.default)
    const wrapper = await mountSuspended(BrosChatMarkdown, { props: { text: SAMPLE } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.bros-prose').exists()).toBe(true)
    expect(wrapper.find('.bros-chat-md').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('prose-sm')
    expect(wrapper.find('h2').exists()).toBe(true)
    expect(wrapper.find('ul').exists()).toBe(true)
    expect(wrapper.find('blockquote').exists()).toBe(true)
    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('pre').exists()).toBe(true)
    expect(wrapper.find('.bros-code').exists()).toBe(true)
  })
})
