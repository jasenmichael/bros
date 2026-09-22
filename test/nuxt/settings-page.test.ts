import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

mockNuxtImport('useFetch', () => {
  return () => ({
    data: ref({
      workingDir: '/app',
      dataDir: '/data',
      hasPasscode: true,
      chatPrepend: '',
      chatAssistantDescription: '',
      enableHostOllama: false,
    }),
    refresh: async () => {},
    pending: ref(false),
  })
})

mockNuxtImport('useSeoMeta', () => () => {})

describe('Settings page', () => {
  it('shows the Chat section with prepend and assistant description', async () => {
    const SettingsPage = await import('../../src/app/pages/settings/index.vue').then((m) => m.default)
    const wrapper = await mountSuspended(SettingsPage)
    expect(wrapper.text()).toContain('Chat')
    expect(wrapper.text()).toContain('Prepend to every message')
    expect(wrapper.text()).toContain('Extra context added before each send')
    expect(wrapper.text()).toContain('Assistant description')
    expect(wrapper.text()).toContain('How the assistant should sound')
    expect(wrapper.text()).toContain('working_dir')
    expect(wrapper.text()).toContain('Passkey')
    expect(wrapper.text()).toContain('Enable host Ollama')
    expect(wrapper.text()).toContain('Show the host daemon as a Chat/Providers row')
    expect(wrapper.find('[aria-label="Enable host Ollama"]').exists()).toBe(true)
    const textareas = wrapper.findAll('textarea')
    expect(textareas.length).toBeGreaterThanOrEqual(2)
    for (const box of textareas) {
      expect(box.classes().join(' ') + (box.element.parentElement?.className || '')).toMatch(/w-full/)
    }
    const inputs = wrapper.findAll('input[type="password"]')
    expect(inputs.length).toBe(2)
    for (const input of inputs) {
      expect(input.classes().join(' ') + (input.element.parentElement?.className || '')).toMatch(/w-full/)
    }
  })
})
