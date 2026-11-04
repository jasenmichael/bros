import { describe, expect, it } from 'vitest'
import { chooseHostPort, composeHostPortEnv, fixedHostPublish } from '../../app/server/utils/hostPublish'

describe('chooseHostPort', () => {
  it('keeps a free start port and skips 3000 and 8080', async () => {
    const taken = new Set([4780, 2999, 3000, 8080])
    expect(await chooseHostPort(4780, async (port) => taken.has(port))).toBe(4781)
    expect(await chooseHostPort(2999, async (port) => taken.has(port))).toBe(3001)
    expect(await chooseHostPort(8080, async (port) => taken.has(port))).toBe(8081)
  })

  it('stops after 100 probes', async () => {
    expect(await chooseHostPort(1, async () => true, 100)).toBeUndefined()
  })
})

describe('compose host port', () => {
  it('reads the compose default and leaves Ollama and Whisper fixed', () => {
    const yml = 'ports:\n  - "${BROS_PI_DURABLE_PORT:-4780}:4780"\n'
    expect(composeHostPortEnv(yml, 4780)).toBe('BROS_PI_DURABLE_PORT')
    expect(composeHostPortEnv('ports:\n  - "4780:4780"\n', 4780)).toBeUndefined()
    expect(fixedHostPublish('ollama')).toBe(true)
    expect(fixedHostPublish('whisper')).toBe(true)
    expect(fixedHostPublish('pi-durable')).toBe(false)
  })
})
