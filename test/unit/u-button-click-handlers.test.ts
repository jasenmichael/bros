import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Seam: Vue templates that wire UButton @click.
 * Catches bare assignments (`@click="open = false"`) which typecheck as
 * `(event) => boolean` and fail `pnpm typecheck` against Nuxt UI handlers.
 * Misses: script-side handlers that still return a boolean.
 */
const root = join(import.meta.dirname, '../..')
const files = [
  'app/ui/components/CliAppDialog.vue',
  'app/ui/components/SettingsProviders.vue',
  'app/ui/pages/agents/index.vue',
  'app/ui/pages/settings/index.vue',
]

const bareAssignClick = /@click="[A-Za-z0-9_.$]+ = (?:true|false)"/

describe('UButton click handlers', () => {
  it('does not use bare boolean assignments on @click', () => {
    const hits: string[] = []
    for (const rel of files) {
      const src = readFileSync(join(root, rel), 'utf8')
      for (const line of src.split('\n')) {
        if (bareAssignClick.test(line)) hits.push(`${rel}: ${line.trim()}`)
      }
    }
    expect(hits).toEqual([])
  })
})
