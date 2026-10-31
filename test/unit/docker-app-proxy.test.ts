import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { setAppRunsInDockerForTests } from '../../app/server/utils/hostProbe'
import {
  collectPublicProxyTargets,
  firstPathSegment,
  isPublicProxyPath,
  matchPublicProxyTarget,
  needsAuthGate,
  pathMatchesDockerAppPrefix,
  proxyRequestPath,
  rewriteProxyLocation,
  dockerAppEnvPortKey,
  dockerAppProxyTargetUrl,
  dockerAppProxyUpstreamOrigin,
  stripNamedCookie,
  stripSessionCookie,
} from '../../app/server/utils/docker-app/dockerAppProxy'
import { parseDockerAppMeta, type DockerAppMeta } from '../../app/server/utils/docker-app/dockerApps'
import { dockerAppOpenLinks, dockerAppWebUiLinks } from '../../app/ui/utils/docker-app/dockerAppHostLinks'

const root = join(import.meta.dirname, '../..')

function fixtureDockerApp(id: string, publicProxy = true): DockerAppMeta {
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

describe('dockerApp path allowlist', () => {
  const targets = collectPublicProxyTargets([
    fixtureDockerApp('opencode'),
    fixtureDockerApp('openwebui', false),
  ])

  it('matches /opencode and subpaths, not /chat or /opencode-extra', () => {
    expect(firstPathSegment('/opencode/foo')).toBe('opencode')
    expect(pathMatchesDockerAppPrefix('/opencode', 'opencode')).toBe(true)
    expect(pathMatchesDockerAppPrefix('/opencode/', 'opencode')).toBe(true)
    expect(pathMatchesDockerAppPrefix('/opencode/foo', 'opencode')).toBe(true)
    expect(pathMatchesDockerAppPrefix('/opencode-extra', 'opencode')).toBe(false)
    expect(pathMatchesDockerAppPrefix('/chat', 'opencode')).toBe(false)
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
    expect(needsAuthGate('/terminal', ids)).toBe(true)
    expect(needsAuthGate('/terminal/session/', ids)).toBe(true)
    expect(needsAuthGate('/desktop/view/', ids)).toBe(true)
    expect(needsAuthGate('/api/apps', ids)).toBe(true)
    expect(needsAuthGate('/apps', ids)).toBe(true)
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
    expect(dockerAppProxyUpstreamOrigin({
      service: 'opencode',
      containerPort: 4096,
      publish: 4097,
      envPortKey: 'BROS_OPENCODE_PORT',
    }, { BROS_OPENCODE_PORT: '19999' })).toBe('http://opencode:4096')

    setAppRunsInDockerForTests(false)
    expect(dockerAppProxyUpstreamOrigin({
      service: 'opencode',
      containerPort: 4096,
      publish: 4097,
      envPortKey: 'BROS_OPENCODE_PORT',
    })).toBe('http://127.0.0.1:4097')
    expect(dockerAppProxyUpstreamOrigin({
      service: 'opencode',
      containerPort: 4096,
      publish: 4097,
      envPortKey: 'BROS_OPENCODE_PORT',
    }, { BROS_OPENCODE_PORT: '4099' })).toBe('http://127.0.0.1:4099')
  })

  it('preserves the public path on the upstream URL', () => {
    expect(dockerAppProxyTargetUrl('http://opencode:4096', '/opencode/foo', '?q=1'))
      .toBe('http://opencode:4096/opencode/foo?q=1')
    expect(dockerAppProxyTargetUrl('http://127.0.0.1:4097', '/opencode/foo'))
      .toBe('http://127.0.0.1:4097/opencode/foo')
    expect(() => dockerAppProxyTargetUrl('https://opencode:4096', '/opencode')).toThrow(/http/)
  })

  it('maps dockerApp id to BROS_*_PORT', () => {
    expect(dockerAppEnvPortKey('opencode')).toBe('BROS_OPENCODE_PORT')
    expect(dockerAppEnvPortKey('firecrawl-ui')).toBe('BROS_FIRECRAWL_UI_PORT')
    expect(dockerAppEnvPortKey('openjev')).toBe('BROS_OPENJEV_PORT')
  })
})

function shippedDockerApp(rel: string, kind: DockerAppMeta['kind'] = 'docker'): DockerAppMeta {
  const raw = parseYaml(readFileSync(join(root, rel), 'utf8'))
  const meta = parseDockerAppMeta(raw)
  return {
    ...meta,
    source: 'shipped',
    kind,
    dir: rel,
    packageSlug: meta.slug || meta.id,
    disabled: false,
    editable: false,
  }
}

describe('api and openai strip-prefix proxy', () => {
  const targets = collectPublicProxyTargets([
    shippedDockerApp('lib/apps/core/ollama/config.yml'),
    shippedDockerApp('lib/apps/core/whisper/config.yml'),
    shippedDockerApp('lib/apps/addon/firecrawl/config.yml', 'addon'),
    shippedDockerApp('lib/apps/addon/openwebui/config.yml', 'addon'),
    fixtureDockerApp('opencode'),
  ])

  it('strips /ollama before /v1 and /api and ignores other paths', () => {
    const v1 = matchPublicProxyTarget('/ollama/v1/chat/completions', targets)
    expect(v1?.iface.type).toBe('openai')
    expect(v1?.stripPrefix).toBe(true)
    expect(proxyRequestPath(v1!, '/ollama/v1/chat/completions')).toBe('/v1/chat/completions')
    expect(dockerAppProxyTargetUrl('http://ollama:11434', proxyRequestPath(v1!, '/ollama/v1/chat/completions')))
      .toBe('http://ollama:11434/v1/chat/completions')

    const api = matchPublicProxyTarget('/ollama/api/tags', targets)
    expect(api?.iface.type).toBe('api')
    expect(proxyRequestPath(api!, '/ollama/api/tags')).toBe('/api/tags')
    expect(matchPublicProxyTarget('/ollama', targets)).toBeNull()
    expect(matchPublicProxyTarget('/ollama/api-extra', targets)).toBeNull()
  })

  it('strips whisper and firecrawl base paths', () => {
    const whisper = matchPublicProxyTarget('/whisper/v1/audio/transcriptions', targets)
    expect(proxyRequestPath(whisper!, '/whisper/v1/audio/transcriptions')).toBe('/v1/audio/transcriptions')
    const firecrawl = matchPublicProxyTarget('/firecrawl/v2/scrape', targets)
    expect(proxyRequestPath(firecrawl!, '/firecrawl/v2/scrape')).toBe('/v2/scrape')
  })

  it('prefers the longest api base path and leaves a public webui prefix in place', () => {
    const openai = matchPublicProxyTarget('/openwebui/openai/v1/chat/completions', targets)
    expect(openai?.iface.type).toBe('openai')
    expect(proxyRequestPath(openai!, '/openwebui/openai/v1/chat/completions')).toBe('/openai/v1/chat/completions')
    expect(matchPublicProxyTarget('/openwebui/', targets)).toBeNull()

    const web = matchPublicProxyTarget('/opencode/foo', targets)
    expect(web?.stripPrefix).toBe(false)
    expect(proxyRequestPath(web!, '/opencode/foo')).toBe('/opencode/foo')
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
    expect(dockerAppWebUiLinks(row, { viaTunnel: true })[0].to).toBe('/opencode/')
    expect(dockerAppOpenLinks(row, { viaTunnel: true })[0].to).toBe('/opencode/')
    expect(dockerAppWebUiLinks(row, { viaTunnel: false })[0].to).toBe('http://127.0.0.1:4097/opencode/')
    expect(dockerAppOpenLinks({
      id: 'openwebui',
      name: 'Open WebUI',
      interfaces: [{ type: 'webui', publish: 3080 }],
    })[0].to).toBe('http://127.0.0.1:3080/')
  })
})
