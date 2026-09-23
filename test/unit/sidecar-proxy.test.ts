import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { setAppRunsInDockerForTests } from '../../src/server/utils/hostProbe'
import {
  collectPublicProxyTargets,
  firstPathSegment,
  isPublicProxyPath,
  matchPublicProxyTarget,
  needsAuthGate,
  pathMatchesSidecarPrefix,
  rewriteProxyLocation,
  sidecarEnvPortKey,
  sidecarProxyTargetUrl,
  sidecarProxyUpstreamOrigin,
  stripNamedCookie,
  stripSessionCookie,
} from '../../src/server/utils/sidecarProxy'
import { parseSidecarMeta, type SidecarMeta } from '../../src/server/utils/sidecars'
import { sidecarOpenLinks, sidecarWebUiLinks } from '../../src/app/utils/sidecarHostLinks'

const root = join(import.meta.dirname, '../..')

function fixtureSidecar(id: string, publicProxy = true): SidecarMeta {
  return {
    id,
    name: id,
    description: '',
    source: 'shipped',
    kind: 'addon',
    dir: `/tmp/${id}`,
    packageSlug: id,
    disabled: false,
    editable: false,
    interfaces: [{
      type: 'webui',
      service: id,
      containerPort: 4096,
      publish: 4097,
      proxy: publicProxy ? { public: true } : undefined,
    }],
  }
}

describe('sidecar path allowlist', () => {
  const targets = collectPublicProxyTargets([
    fixtureSidecar('opencode'),
    fixtureSidecar('openwebui', false),
  ])

  it('matches /opencode and subpaths, not /chat or /opencode-extra', () => {
    expect(firstPathSegment('/opencode/foo')).toBe('opencode')
    expect(pathMatchesSidecarPrefix('/opencode', 'opencode')).toBe(true)
    expect(pathMatchesSidecarPrefix('/opencode/', 'opencode')).toBe(true)
    expect(pathMatchesSidecarPrefix('/opencode/foo', 'opencode')).toBe(true)
    expect(pathMatchesSidecarPrefix('/opencode-extra', 'opencode')).toBe(false)
    expect(pathMatchesSidecarPrefix('/chat', 'opencode')).toBe(false)
    expect(isPublicProxyPath('/opencode/ws', ['opencode'])).toBe(true)
    expect(isPublicProxyPath('/opencode-extra', ['opencode'])).toBe(false)
    expect(isPublicProxyPath('/chat', ['opencode'])).toBe(false)
    expect(matchPublicProxyTarget('/opencode/foo', targets)?.id).toBe('opencode')
    expect(matchPublicProxyTarget('/chat', targets)).toBeNull()
    expect(matchPublicProxyTarget('/opencode-extra', targets)).toBeNull()
    expect(matchPublicProxyTarget('/openwebui', targets)).toBeNull()
  })
})

describe('auth gate for public proxy', () => {
  it('gates /opencode like /chat and leaves /opencode-extra open', () => {
    const ids = ['opencode']
    expect(needsAuthGate('/opencode', ids)).toBe(true)
    expect(needsAuthGate('/opencode/', ids)).toBe(true)
    expect(needsAuthGate('/opencode/foo', ids)).toBe(true)
    expect(needsAuthGate('/chat', ids)).toBe(true)
    expect(needsAuthGate('/api/sidecars', ids)).toBe(true)
    expect(needsAuthGate('/opencode-extra', ids)).toBe(false)
    expect(needsAuthGate('/docs', ids)).toBe(false)
    expect(needsAuthGate('/login', ids)).toBe(false)
  })
})

describe('Location rewrite', () => {
  const prefix = '/opencode'
  const upstreamOrigins = ['http://opencode:4096', 'http://127.0.0.1:4097']

  it('rewrites upstream origin and root-absolute paths missing /opencode', () => {
    expect(rewriteProxyLocation({
      location: 'http://opencode:4096/opencode/foo',
      prefix,
      upstreamOrigins,
    })).toBe('/opencode/foo')
    expect(rewriteProxyLocation({
      location: 'http://127.0.0.1:4097/',
      prefix,
      upstreamOrigins,
    })).toBe('/opencode/')
    expect(rewriteProxyLocation({
      location: 'http://opencode:4096/login',
      prefix,
      upstreamOrigins,
    })).toBe('/opencode/login')
    expect(rewriteProxyLocation({
      location: '/login',
      prefix,
      upstreamOrigins,
    })).toBe('/opencode/login')
    expect(rewriteProxyLocation({
      location: '/opencode/bar',
      prefix,
      upstreamOrigins,
    })).toBe('/opencode/bar')
    expect(rewriteProxyLocation({
      location: 'https://evil.example/',
      prefix,
      upstreamOrigins,
    })).toBe('https://evil.example/')
  })
})

describe('proxy upstream URL helper', () => {
  afterEach(() => {
    setAppRunsInDockerForTests(undefined)
  })

  it('uses Docker DNS in-container and 127.0.0.1 publish on host Node', () => {
    setAppRunsInDockerForTests(true)
    expect(sidecarProxyUpstreamOrigin({
      service: 'opencode',
      containerPort: 4096,
      publish: 4097,
      envPortKey: 'BROS_OPENCODE_PORT',
    }, { BROS_OPENCODE_PORT: '19999' })).toBe('http://opencode:4096')

    setAppRunsInDockerForTests(false)
    expect(sidecarProxyUpstreamOrigin({
      service: 'opencode',
      containerPort: 4096,
      publish: 4097,
      envPortKey: 'BROS_OPENCODE_PORT',
    })).toBe('http://127.0.0.1:4097')
    expect(sidecarProxyUpstreamOrigin({
      service: 'opencode',
      containerPort: 4096,
      publish: 4097,
      envPortKey: 'BROS_OPENCODE_PORT',
    }, { BROS_OPENCODE_PORT: '4099' })).toBe('http://127.0.0.1:4099')
  })

  it('preserves the public path on the upstream URL', () => {
    expect(sidecarProxyTargetUrl('http://opencode:4096', '/opencode/foo', '?q=1'))
      .toBe('http://opencode:4096/opencode/foo?q=1')
    expect(sidecarProxyTargetUrl('http://127.0.0.1:4097', '/opencode/foo'))
      .toBe('http://127.0.0.1:4097/opencode/foo')
    expect(() => sidecarProxyTargetUrl('https://opencode:4096', '/opencode')).toThrow(/http/)
  })

  it('maps sidecar id to BROS_*_PORT', () => {
    expect(sidecarEnvPortKey('opencode')).toBe('BROS_OPENCODE_PORT')
    expect(sidecarEnvPortKey('firecrawl-ui')).toBe('BROS_FIRECRAWL_UI_PORT')
  })
})

describe('session cookie strip', () => {
  it('drops bros_session and keeps other cookies', () => {
    expect(stripSessionCookie('bros_session=abc; theme=dark')).toBe('theme=dark')
    expect(stripSessionCookie('bros_session=abc')).toBeUndefined()
    expect(stripNamedCookie('a=1; b=2', 'a')).toBe('b=2')
  })
})

describe('Open/Pin URLs', () => {
  const row = {
    id: 'opencode',
    name: 'OpenCode',
    packageSlug: 'opencode',
    interfaces: [{
      type: 'webui' as const,
      service: 'opencode',
      containerPort: 4096,
      publish: 4097,
      proxy: { public: true },
    }],
  }

  it('uses /opencode/ via-tunnel and host /opencode/ on LAN', () => {
    expect(sidecarWebUiLinks(row, { viaTunnel: true })[0].to).toBe('/opencode/')
    expect(sidecarOpenLinks(row, { viaTunnel: true })[0].to).toBe('/opencode/')
    expect(sidecarWebUiLinks(row, { viaTunnel: false })[0].to).toBe('http://127.0.0.1:4097/opencode/')
    expect(sidecarOpenLinks({
      id: 'openwebui',
      name: 'Open WebUI',
      interfaces: [{ type: 'webui', publish: 3080 }],
    })[0].to).toBe('http://127.0.0.1:3080/')
  })
})

describe('shipped OpenCode fixture', () => {
  it('keeps base-path env, skips proxy.public, and does not pass --base-path', () => {
    const raw = parseYaml(readFileSync(join(root, 'sidecars/addon/opencode/sidecar.yml'), 'utf8'))
    const meta = parseSidecarMeta(raw)
    expect(meta.id).toBe('opencode')
    const webui = meta.interfaces.find((iface) => iface.type === 'webui')
    expect(webui).toMatchObject({
      type: 'webui',
      service: 'opencode',
      containerPort: 4096,
      publish: 4097,
    })
    expect(webui?.proxy?.public).not.toBe(true)
    const compose = readFileSync(join(root, 'sidecars/addon/opencode/docker-compose.yml'), 'utf8')
    expect(compose).toMatch(/OPENCODE_SERVER_BASE_PATH:\s*\/opencode/)
    expect(compose).toContain('["web", "--hostname", "0.0.0.0", "--port", "4096"]')
    expect(compose).not.toMatch(/command:.*--base-path/)
    const row = {
      id: meta.id,
      name: meta.name,
      packageSlug: meta.slug,
      interfaces: meta.interfaces,
    }
    expect(sidecarWebUiLinks(row)[0].to).toBe('http://127.0.0.1:4097/')
    expect(sidecarWebUiLinks(row, { viaTunnel: true })[0].to).toBe('http://127.0.0.1:4097/')
  })
})
