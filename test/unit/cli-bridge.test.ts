import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CLI_BRIDGE_MARK,
  brosCliSource,
  syncCliBridges,
} from '../../src/server/utils/docker-app/cliBridge'

const pack = {
  id: 'cursor',
  dir: '/packs/cursor',
  interfaces: [{ type: 'cli' as const, service: 'cursor', command: '/home/bros/.local/bin/agent', bin: 'agent' }],
}

describe('cli source', () => {
  it('uses the running dockerApp, then the host bin', () => {
    expect(brosCliSource({ hostBin: true, dockerAppRunning: true })).toBe('docker')
    expect(brosCliSource({ hostBin: true, dockerAppRunning: false })).toBe('host')
    expect(brosCliSource({ hostBin: false, dockerAppRunning: true })).toBe('docker')
    expect(brosCliSource({ hostBin: false, dockerAppRunning: false })).toBe('none')
  })
})

describe('cli bridge files', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  function dirs() {
    root = mkdtempSync(join(tmpdir(), 'bros-cli-'))
    const hostBinDir = join(root, 'host-bin')
    const brosBinDir = join(root, 'bros-bin')
    mkdirSync(hostBinDir, { recursive: true })
    return { hostBinDir, brosBinDir }
  }

  function sync(hostBinDir: string, brosBinDir: string, running: Set<string>, dockerApps = [pack]) {
    syncCliBridges({
      dockerApps,
      running,
      brosBinDir,
      hostBinDir,
      execBinDir: hostBinDir,
    })
  }

  it('keeps a real host binary and points Bros at the running dockerApp', () => {
    const { hostBinDir, brosBinDir } = dirs()
    const real = join(hostBinDir, 'agent')
    writeFileSync(real, '#!/bin/sh\necho real\n', { mode: 0o755 })
    sync(hostBinDir, brosBinDir, new Set(['cursor']))
    expect(readFileSync(real, 'utf8')).toBe('#!/bin/sh\necho real\n')
    const bros = readFileSync(join(brosBinDir, 'agent'), 'utf8')
    expect(bros).toContain(CLI_BRIDGE_MARK)
    expect(bros).toContain('bros-cursor')
    expect(bros).toContain("'-it'")
    expect(bros).toContain('-icrnl')
    expect(bros).not.toContain(real)
  })

  it('writes a Bros wrapper and never a host wrapper', () => {
    const { hostBinDir, brosBinDir } = dirs()
    sync(hostBinDir, brosBinDir, new Set(['cursor']))
    const body = readFileSync(join(brosBinDir, 'agent'), 'utf8')
    expect(body).toContain(CLI_BRIDGE_MARK)
    expect(body).toContain('docker')
    expect(body).toContain('bros-cursor')
    expect(body).toContain('/home/bros/.local/bin/agent')
    expect(() => readFileSync(join(hostBinDir, 'agent'), 'utf8')).toThrow()
  })

  it('deletes host bridge scripts for agent, pnpm, and pnpx', () => {
    const { hostBinDir, brosBinDir } = dirs()
    for (const name of ['agent', 'pnpm', 'pnpx']) {
      writeFileSync(join(hostBinDir, name), `#!/bin/sh\n${CLI_BRIDGE_MARK}\nexec ${name}\n`)
    }
    const real = join(hostBinDir, 'npm')
    writeFileSync(real, '#!/bin/sh\necho real\n', { mode: 0o755 })
    sync(hostBinDir, brosBinDir, new Set(['cursor']))
    for (const name of ['agent', 'pnpm', 'pnpx']) {
      expect(() => readFileSync(join(hostBinDir, name), 'utf8')).toThrow()
    }
    expect(readFileSync(real, 'utf8')).toBe('#!/bin/sh\necho real\n')
  })

  it('points Bros at the host bin when the dockerApp is stopped', () => {
    const { hostBinDir, brosBinDir } = dirs()
    const real = join(hostBinDir, 'agent')
    writeFileSync(real, '#!/bin/sh\necho real\n', { mode: 0o755 })
    sync(hostBinDir, brosBinDir, new Set())
    expect(readFileSync(real, 'utf8')).toBe('#!/bin/sh\necho real\n')
    const bros = readFileSync(join(brosBinDir, 'agent'), 'utf8')
    expect(bros).toContain(real)
    expect(bros).not.toContain('docker')
  })

  it('never wraps a shell, and deletes a shell bridge', () => {
    const { hostBinDir, brosBinDir } = dirs()
    mkdirSync(brosBinDir, { recursive: true })
    writeFileSync(join(hostBinDir, 'bash'), `#!/bin/sh\n${CLI_BRIDGE_MARK}\nexec bash\n`)
    writeFileSync(join(brosBinDir, 'bash'), `#!/bin/sh\n${CLI_BRIDGE_MARK}\nexec bash\n`)
    sync(hostBinDir, brosBinDir, new Set(['cli']), [{
      id: 'cli',
      dir: '/packs/cli',
      interfaces: [{ type: 'cli' as const, service: 'cli', command: '/bin/bash', bin: 'bash' }],
    }])
    expect(() => readFileSync(join(hostBinDir, 'bash'), 'utf8')).toThrow()
    expect(() => readFileSync(join(brosBinDir, 'bash'), 'utf8')).toThrow()
  })

  it('does not write app bins on the host or the Desktop PATH', () => {
    const { hostBinDir, brosBinDir } = dirs()
    sync(hostBinDir, brosBinDir, new Set(['desktop']), [{
      id: 'desktop',
      dir: '/packs/desktop',
      interfaces: [{ type: 'cli' as const, service: 'desktop', command: '/bin/bash', bin: 'bash' }],
    }])
    expect(() => readFileSync(join(hostBinDir, 'pnpm'), 'utf8')).toThrow()
    expect(() => readFileSync(join(hostBinDir, 'pnpx'), 'utf8')).toThrow()
    expect(() => readFileSync(join(brosBinDir, 'pnpm'), 'utf8')).toThrow()
    expect(() => readFileSync(join(hostBinDir, 'bash'), 'utf8')).toThrow()
  })

  it('removes the Bros wrapper when the dockerApp stops', () => {
    const { hostBinDir, brosBinDir } = dirs()
    sync(hostBinDir, brosBinDir, new Set(['cursor']))
    sync(hostBinDir, brosBinDir, new Set())
    expect(() => readFileSync(join(hostBinDir, 'agent'), 'utf8')).toThrow()
    expect(() => readFileSync(join(brosBinDir, 'agent'), 'utf8')).toThrow()
  })
})
