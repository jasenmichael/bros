import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  isCloudflareZoneOwnershipError,
  isCloudflaredInstalled,
  isCloudflaredLoggedIn,
  isTunnelHelperAlive,
  namedTunnelRouteOwned,
  parseQuickTunnelHostname,
  readTunnelLogs,
  readTunnelStatus,
  tailLines,
  tunnelPublicPayload,
  writeTunnelCommand,
} from '../../src/server/utils/tunnel'

describe('cloudflared install/login detection', () => {
  it('treats a non-empty path as installed', () => {
    expect(isCloudflaredInstalled('/home/me/.local/bin/cloudflared')).toBe(true)
    expect(isCloudflaredInstalled('  ')).toBe(false)
    expect(isCloudflaredInstalled(null)).toBe(false)
  })

  it('treats cert.pem or a successful tunnel list as logged in', () => {
    expect(isCloudflaredLoggedIn({ certExists: true })).toBe(true)
    expect(isCloudflaredLoggedIn({ certExists: false, tunnelListOk: true })).toBe(true)
    expect(isCloudflaredLoggedIn({ certExists: false, tunnelListOk: false })).toBe(false)
  })
})

describe('named tunnel zone ownership', () => {
  it('treats an exact Added CNAME as owned', () => {
    const out = 'INF Added CNAME bros.example.com which will route to this tunnel tunnelID=abc'
    expect(namedTunnelRouteOwned('bros.example.com', out)).toBe(true)
    expect(isCloudflareZoneOwnershipError(out, 'bros.example.com')).toBe(false)
  })

  it('treats a zone-appended CNAME as not owned', () => {
    const out = 'INF Added CNAME bros.other.com.jasenmichael.com which will route to this tunnel'
    expect(namedTunnelRouteOwned('bros.other.com', out)).toBe(false)
    expect(isCloudflareZoneOwnershipError(out, 'bros.other.com')).toBe(true)
  })

  it('treats zone-not-found text as not owned', () => {
    expect(namedTunnelRouteOwned('bros.other.com', 'ERR could not find zone for hostname')).toBe(false)
  })
})

describe('parseQuickTunnelHostname', () => {
  it('takes the last trycloudflare URL from logs', () => {
    const logs = [
      'INF Starting',
      'INF |  https://old-name.trycloudflare.com',
      'INF |  https://lucky-river-1234.trycloudflare.com',
    ].join('\n')
    expect(parseQuickTunnelHostname(logs)).toBe('lucky-river-1234.trycloudflare.com')
  })

  it('returns null when no quick-tunnel URL is present', () => {
    expect(parseQuickTunnelHostname('connection refused')).toBeNull()
  })
})

describe('helper heartbeat', () => {
  it('is alive only when updatedAt is fresh', () => {
    const now = 1_000_000
    expect(isTunnelHelperAlive(now - 1_000, now)).toBe(true)
    expect(isTunnelHelperAlive(now - 20_000, now)).toBe(false)
    expect(isTunnelHelperAlive(null, now)).toBe(false)
  })
})

describe('tunnel control files', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('reads status.json and writes start/stop commands', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-tunnel-'))
    mkdirSync(join(root, 'tunnel'), { recursive: true })
    writeFileSync(join(root, 'tunnel', 'status.json'), JSON.stringify({
      running: true,
      pid: 42,
      hostname: 'lucky-river-1234.trycloudflare.com',
      error: null,
      installed: true,
      loggedIn: true,
      helper: true,
      updatedAt: Date.now(),
    }))
    writeFileSync(join(root, 'tunnel', 'logs.txt'), 'a\nb\nc\nd\n')

    const status = readTunnelStatus(root)
    expect(status.running).toBe(true)
    expect(status.hostname).toBe('lucky-river-1234.trycloudflare.com')
    expect(status.installed).toBe(true)
    expect(status.loggedIn).toBe(true)
    expect(status.helperAlive).toBe(true)
    expect(readTunnelLogs(root, 2)).toBe('c\nd')
    expect(tailLines('1\n2\n3', 2)).toBe('2\n3')

    writeTunnelCommand(root, 'stop')
    expect(readFileSync(join(root, 'tunnel', 'enabled'), 'utf8').trim()).toBe('0')
    expect(readFileSync(join(root, 'tunnel', 'command'), 'utf8').trim()).toBe('stop')
    writeTunnelCommand(root, 'start')
    expect(readFileSync(join(root, 'tunnel', 'enabled'), 'utf8').trim()).toBe('1')
    expect(readFileSync(join(root, 'tunnel', 'command'), 'utf8').trim()).toBe('start')
  })

  it('surfaces public_url and start error in the public payload', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-tunnel-err-'))
    mkdirSync(join(root, 'tunnel'), { recursive: true })
    writeFileSync(join(root, 'tunnel', 'status.json'), JSON.stringify({
      running: false,
      pid: null,
      hostname: null,
      publicUrl: 'https://bros.example.com',
      error: 'cloudflared is not installed on the host. Run ./bros in a terminal to install.',
      installed: false,
      loggedIn: false,
      helper: true,
      updatedAt: Date.now(),
    }))
    const status = readTunnelStatus(root)
    expect(status.error).toContain('cloudflared is not installed')
    expect(status.publicUrl).toBe('https://bros.example.com')
    const payload = tunnelPublicPayload(status, 'https://bros.example.com')
    expect(payload.error).toContain('cloudflared is not installed')
    expect(payload.publicUrl).toBe('https://bros.example.com')
    expect(payload.hostname).toBe('https://bros.example.com')
  })

  it('surfaces zone-ownership start error in the public payload', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-tunnel-zone-'))
    mkdirSync(join(root, 'tunnel'), { recursive: true })
    writeFileSync(join(root, 'tunnel', 'status.json'), JSON.stringify({
      running: false,
      pid: null,
      hostname: null,
      publicUrl: 'https://bros.example.com',
      error: 'Cloudflare account (cloudflared login) does not own the DNS zone for bros.example.com.',
      installed: true,
      loggedIn: true,
      helper: true,
      updatedAt: Date.now(),
    }))
    const status = readTunnelStatus(root)
    expect(status.error).toMatch(/does not own the DNS zone/)
    expect(tunnelPublicPayload(status, 'https://bros.example.com').error).toMatch(/does not own the DNS zone/)
  })

  it('returns empty status when helper files are missing', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-tunnel-empty-'))
    const status = readTunnelStatus(root)
    expect(status.running).toBe(false)
    expect(status.helperAlive).toBe(false)
    expect(readTunnelLogs(root)).toBe('')
  })
})
