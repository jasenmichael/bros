import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { isMissingHostDataBind } from '../../src/server/utils/docker'
import { isReservedSidecarId, parseSidecarMeta, projectName, RESERVED_SLUGS } from '../../src/server/utils/sidecars'

describe('sidecar project naming', () => {
  it('prefixes compose projects with bros-sc-', () => {
    expect(projectName('ollama')).toBe('bros-sc-ollama')
    expect(projectName('openwebui')).toBe('bros-sc-openwebui')
  })

  it('reserves core app routes from sidecar slugs', () => {
    expect(RESERVED_SLUGS.has('models')).toBe(true)
    expect(RESERVED_SLUGS.has('providers')).toBe(true)
    expect(RESERVED_SLUGS.has('api')).toBe(true)
    expect(RESERVED_SLUGS.has('status')).toBe(true)
    expect(RESERVED_SLUGS.has('ollama')).toBe(false)
    expect(isReservedSidecarId('ollama')).toBe(true)
    expect(isReservedSidecarId('chat')).toBe(true)
  })

  it('requires webui publish and rejects 3000/8080', () => {
    expect(() => parseSidecarMeta({
      id: 'demo',
      name: 'Demo',
      interfaces: [{ type: 'webui', service: 'demo', containerPort: 80 }],
    })).toThrow(/publish/)
    expect(() => parseSidecarMeta({
      id: 'demo',
      name: 'Demo',
      interfaces: [{ type: 'webui', service: 'demo', containerPort: 80, publish: 3000 }],
    })).toThrow(/3000 or 8080/)
    expect(parseSidecarMeta({
      id: 'demo',
      name: 'Demo',
      interfaces: [{ type: 'webui', service: 'demo', containerPort: 80, publish: 3090 }],
    }).interfaces[0].publish).toBe(3090)
  })

  it('parses shipped firecrawl-ui webui publish 3081', () => {
    const raw = parseYaml(readFileSync(join(import.meta.dirname, '../../sidecars/firecrawl-ui/sidecar.yml'), 'utf8'))
    const meta = parseSidecarMeta(raw)
    expect(meta.id).toBe('firecrawl-ui')
    expect(meta.interfaces[0]).toMatchObject({
      type: 'webui',
      service: 'firecrawl-ui',
      containerPort: 8080,
      publish: 3081,
    })
  })

  it('parses shipped firecrawl api publish 3002', () => {
    const raw = parseYaml(readFileSync(join(import.meta.dirname, '../../sidecars/firecrawl/sidecar.yml'), 'utf8'))
    const meta = parseSidecarMeta(raw)
    expect(meta.id).toBe('firecrawl')
    expect(meta.interfaces[0]).toMatchObject({
      type: 'api',
      service: 'firecrawl',
      containerPort: 3002,
      publish: 3002,
      basePath: '/v2',
    })
  })

  it('parses ollama publish 11435', () => {
    const meta = parseSidecarMeta({
      id: 'ollama',
      name: 'Ollama',
      interfaces: [{ type: 'api', service: 'ollama', containerPort: 11434, publish: 11435 }],
    })
    expect(meta.interfaces[0].publish).toBe(11435)
    expect(meta.interfaces[0].containerPort).toBe(11434)
  })
})

describe('sidecar data binds', () => {
  it('treats /ollama as a missing BROS_HOST_DATA_DIR interpolation', () => {
    const hostData = '/home/me/dev/bros/data'
    expect(isMissingHostDataBind('/ollama', hostData)).toBe(true)
    expect(isMissingHostDataBind('/openwebui', hostData)).toBe(true)
    expect(isMissingHostDataBind(`${hostData}/ollama`, hostData)).toBe(false)
    expect(isMissingHostDataBind('/home/me', hostData)).toBe(false)
  })

  it('sidecars join external network bros', () => {
    const root = join(import.meta.dirname, '../..')
    for (const rel of [
      'sidecars/ollama/docker-compose.yml',
      'sidecars/openwebui/docker-compose.yml',
      'sidecars/opencode/docker-compose.yml',
      'sidecars/firecrawl/docker-compose.yml',
      'sidecars/firecrawl-ui/docker-compose.yml',
    ]) {
      const yml = readFileSync(join(root, rel), 'utf8')
      expect(yml).toMatch(/\n\s+bros:\s*\n\s+external:\s*true/m)
    }
  })

  it('sets OLLAMA_NOPRUNE=1 on sidecar Ollama compose', () => {
    const root = join(import.meta.dirname, '../..')
    for (const rel of [
      'sidecars/ollama/docker-compose.yml',
      'sidecars/ollama/docker-compose.gpu.yml',
    ]) {
      const yml = readFileSync(join(root, rel), 'utf8')
      expect(yml).toMatch(/OLLAMA_NOPRUNE:\s*"1"/)
      expect(yml).not.toMatch(/OLLAMA_NOPRUNE:\s*"true"/)
    }
    expect(readFileSync(join(root, 'sidecars/ollama/sidecar.yml'), 'utf8')).toContain('OLLAMA_NOPRUNE=1')
    expect(readFileSync(join(root, 'src/server/utils/docker.ts'), 'utf8')).toContain("OLLAMA_NOPRUNE: '1'")
  })

  it('firecrawl-ui compose publishes 3081 not 8080', () => {
    const dir = join(import.meta.dirname, '../../sidecars/firecrawl-ui')
    const yml = readFileSync(join(dir, 'docker-compose.yml'), 'utf8')
    expect(yml).toContain('${BROS_FIRECRAWL_UI_PORT:-3081}:8080')
    expect(yml).toContain('build: .')
    expect(yml).not.toMatch(/-\s+["']?8080:/)
    expect(yml).not.toMatch(/-\s+["']?3000:/)
    expect(readFileSync(join(dir, 'Dockerfile'), 'utf8')).toContain('FROM obeoneorg/firecrawl-ui')
    const nginx = readFileSync(join(dir, 'nginx.conf'), 'utf8')
    expect(nginx).toContain('proxy_pass http://$firecrawl_upstream')
    expect(nginx).toContain('location /v2/')
    expect(nginx).toContain('listen 8080')
  })

  it('firecrawl compose publishes 3002 only and skips FoundationDB', () => {
    const yml = readFileSync(join(import.meta.dirname, '../../sidecars/firecrawl/docker-compose.yml'), 'utf8')
    expect(yml).toContain('${BROS_FIRECRAWL_PORT:-3002}:3002')
    expect(yml).not.toMatch(/-\s+["']?3000:/)
    expect(yml).not.toContain('foundationdb')
    expect(yml).toContain('USE_DB_AUTHENTICATION: "false"')
    expect(yml).toContain('ALLOW_LOCAL_WEBHOOKS: "true"')
    expect(yml).toContain('TEST_SUITE_SELF_HOSTED: "true"')
    expect(yml).toContain('OLLAMA_BASE_URL: http://ollama:11434')
  })

  it('requires BROS_HOST_DATA_DIR in sidecar compose so empty env cannot bind /ollama', () => {
    const root = join(import.meta.dirname, '../..')
    for (const rel of [
      'sidecars/ollama/docker-compose.yml',
      'sidecars/ollama/docker-compose.gpu.yml',
      'sidecars/openwebui/docker-compose.yml',
      'sidecars/opencode/docker-compose.yml',
      'sidecars/firecrawl/docker-compose.yml',
    ]) {
      const yml = readFileSync(join(root, rel), 'utf8')
      expect(yml).toContain('${BROS_HOST_DATA_DIR:?unset}')
      expect(yml).not.toMatch(/\$\{BROS_HOST_DATA_DIR\}\//)
    }
  })
})
