import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  advertisedTunnelHost,
  applyTunnelPower,
  cloudflaredStopBlocked,
  CLOUDFLARED_SIDECAR_ID,
  hostnameFromPublicUrl,
  isViaTunnel,
  TUNNEL_STOP_LOCKED_MESSAGE,
  tunnelHostname,
} from '../../src/server/utils/viaTunnel'

describe('isViaTunnel', () => {
  const prevHost = process.env.BROS_TUNNEL_HOST

  afterEach(() => {
    if (prevHost == null) delete process.env.BROS_TUNNEL_HOST
    else process.env.BROS_TUNNEL_HOST = prevHost
  })

  it('is false for a local request with no CF headers', () => {
    expect(isViaTunnel({
      headers: { host: '127.0.0.1:3055' },
      host: '127.0.0.1:3055',
    })).toBe(false)
  })

  it('is true when cf-ray is present', () => {
    expect(isViaTunnel({ headers: { 'cf-ray': '8a1b2c3d4e5f6a7b-EWR' } })).toBe(true)
  })

  it('is true when cf-connecting-ip is present', () => {
    expect(isViaTunnel({ headers: { 'CF-Connecting-IP': '1.2.3.4' } })).toBe(true)
  })

  it('is true when cf-visitor is present', () => {
    expect(isViaTunnel({ headers: { 'cf-visitor': '{"scheme":"https"}' } })).toBe(true)
  })

  it('is true when cdn-loop names cloudflare', () => {
    expect(isViaTunnel({ headers: { 'cdn-loop': 'cloudflare; loops=1' } })).toBe(true)
  })

  it('is true when Host matches BROS_TUNNEL_HOST', () => {
    process.env.BROS_TUNNEL_HOST = 'bros.example.com'
    expect(isViaTunnel({ host: 'bros.example.com' })).toBe(true)
    expect(isViaTunnel({ host: 'bros.example.com:443' })).toBe(true)
    expect(isViaTunnel({ host: '127.0.0.1:3055' })).toBe(false)
  })

  it('is true when Host matches public_url hostname', () => {
    delete process.env.BROS_TUNNEL_HOST
    const host = hostnameFromPublicUrl('https://bros.jasenmichael.com')
    expect(host).toBe('bros.jasenmichael.com')
    expect(isViaTunnel({ host: 'bros.jasenmichael.com', tunnelHost: host })).toBe(true)
    expect(isViaTunnel({ host: 'bros.jasenmichael.com:443', tunnelHost: host })).toBe(true)
    expect(isViaTunnel({ host: '127.0.0.1:3055', tunnelHost: host })).toBe(false)
  })
})

describe('advertisedTunnelHost', () => {
  const prevHost = process.env.BROS_TUNNEL_HOST

  afterEach(() => {
    if (prevHost == null) delete process.env.BROS_TUNNEL_HOST
    else process.env.BROS_TUNNEL_HOST = prevHost
  })

  it('prefers public_url over last quick-tunnel hostname', () => {
    delete process.env.BROS_TUNNEL_HOST
    expect(advertisedTunnelHost({
      publicUrl: 'https://bros.example.com/app',
      lastHostname: 'lucky-river-1234.trycloudflare.com',
    })).toBe('bros.example.com')
  })
})

describe('tunnelHostname', () => {
  const prevHost = process.env.BROS_TUNNEL_HOST

  afterEach(() => {
    if (prevHost == null) delete process.env.BROS_TUNNEL_HOST
    else process.env.BROS_TUNNEL_HOST = prevHost
  })

  it('prefers BROS_TUNNEL_HOST, else the request host when via tunnel', () => {
    delete process.env.BROS_TUNNEL_HOST
    expect(tunnelHostname({ viaTunnel: true, host: 'ai.example.com' })).toBe('ai.example.com')
    expect(tunnelHostname({ viaTunnel: false, host: 'ai.example.com' })).toBeNull()
    expect(tunnelHostname({
      viaTunnel: false,
      host: 'ai.example.com',
      tunnelHost: 'configured.example.com',
    })).toBe('configured.example.com')
  })
})

describe('cloudflared stop lock', () => {
  it('blocks only cloudflared while via tunnel', () => {
    expect(cloudflaredStopBlocked('cloudflared', true)).toBe(true)
    expect(cloudflaredStopBlocked('cloudflared', false)).toBe(false)
    expect(cloudflaredStopBlocked('ollama', true)).toBe(false)
  })
})

describe('applyTunnelPower', () => {
  it('starts the host tunnel when turning on from stopped', async () => {
    const start = vi.fn(async () => ({ running: true }))
    const stop = vi.fn(async () => ({ running: false }))
    const result = await applyTunnelPower(true, {
      viaTunnel: false,
      running: false,
      start,
      stop,
    })
    expect(result).toEqual({ ok: true })
    expect(start).toHaveBeenCalledTimes(1)
    expect(stop).not.toHaveBeenCalled()
  })

  it('does not start again when the tunnel is already running', async () => {
    const start = vi.fn(async () => ({ running: true }))
    const stop = vi.fn(async () => ({ running: false }))
    await applyTunnelPower(true, { viaTunnel: true, running: true, start, stop })
    expect(start).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
  })

  it('stops the host tunnel when turning off locally', async () => {
    const start = vi.fn()
    const stop = vi.fn(async () => ({ running: false }))
    const result = await applyTunnelPower(false, {
      viaTunnel: false,
      running: true,
      start,
      stop,
    })
    expect(result).toEqual({ ok: true })
    expect(stop).toHaveBeenCalledTimes(1)
    expect(start).not.toHaveBeenCalled()
  })

  it('refuses stop when the session is via tunnel', async () => {
    const start = vi.fn()
    const stop = vi.fn()
    const result = await applyTunnelPower(false, {
      viaTunnel: true,
      running: true,
      start,
      stop,
    })
    expect(result).toEqual({ ok: false, error: TUNNEL_STOP_LOCKED_MESSAGE })
    expect(stop).not.toHaveBeenCalled()
    expect(CLOUDFLARED_SIDECAR_ID).toBe('cloudflared')
  })
})
