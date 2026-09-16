import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

const projects: Array<Record<string, unknown>> = [
  {
    test: {
      name: 'unit',
      include: ['../../test/unit/**/*.{test,spec}.ts'],
      environment: 'node',
      root: rootDir,
    },
  },
  {
    test: {
      name: 'e2e',
      include: ['../../test/e2e/**/*.{test,spec}.ts'],
      environment: 'node',
      root: rootDir,
    },
  },
]

const argv = process.argv.join(' ')
const skipNuxtProject = argv.includes('--project') && !argv.includes('nuxt')
if (!skipNuxtProject) {
  try {
    projects.push(await defineVitestProject({
      root: rootDir,
      test: {
        name: 'nuxt',
        include: ['../../test/nuxt/**/*.{test,spec}.ts'],
        environment: 'nuxt',
      },
    }))
  } catch {
    // Unit/e2e still run when Nuxt is not resolvable (Docker volume without the package).
  }
}

export default defineConfig({
  test: { projects },
})
