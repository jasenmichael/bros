import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROVIDER_PRESETS } from '../../src/server/utils/providerPresets'

const root = join(import.meta.dirname, '../..')

describe('popular provider docs catalog', () => {
  it('keeps one docs page per preset with matching baseUrl and default models', () => {
    expect(PROVIDER_PRESETS).toHaveLength(12)
    const hub = readFileSync(join(root, 'docs/providers.md'), 'utf8')
    for (const preset of PROVIDER_PRESETS) {
      const rel = `docs/providers/${preset.id}.md`
      const path = join(root, rel)
      expect(existsSync(path), rel).toBe(true)
      const body = readFileSync(path, 'utf8')
      expect(body).toContain(preset.baseUrl)
      expect(body).toContain(`# ${preset.name}`)
      for (const model of preset.models) {
        expect(body).toContain(model)
      }
      expect(hub).toContain(`/docs/providers/${preset.id}`)
      expect(hub).toContain(preset.name)
    }
  })
})
