import { fileURLToPath } from 'node:url'
import { defineCollection, defineContentConfig, z } from '@nuxt/content'
import { join } from 'pathe'

// Repo-root docs/ (shared by app + website via this layer)
const docsDir = join(fileURLToPath(new URL('.', import.meta.url)), '../../../docs')

export default defineContentConfig({
  collections: {
    content: defineCollection({
      type: 'page',
      source: {
        cwd: docsDir,
        include: '**/*.md',
        prefix: '/docs',
      },
      schema: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
      }),
    }),
  },
})
