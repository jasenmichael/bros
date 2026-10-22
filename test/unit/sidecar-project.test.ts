import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { composeUsesDesktopNetns, isMissingHostDataBind, shouldAttachProjectNetwork, shouldBuildSidecarImage } from '../../src/server/utils/docker'
import { isReservedSidecarId, parseSidecarMeta, projectName, RESERVED_SLUGS } from '../../src/server/utils/sidecars/sidecars'

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
    expect(parseSidecarMeta({
      id: 'demo',
      name: 'Demo',
      interfaces: [{
        type: 'webui',
        service: 'demo',
        containerPort: 80,
        publish: 3090,
        proxy: { public: true },
      }],
    }).interfaces[0].proxy).toEqual({ public: true })
  })

  it('parses shipped firecrawl-ui webui publish 3081', () => {
    const raw = parseYaml(readFileSync(join(import.meta.dirname, '../../lib/sidecars/addon/firecrawl-ui/sidecar.yml'), 'utf8'))
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
    const raw = parseYaml(readFileSync(join(import.meta.dirname, '../../lib/sidecars/addon/firecrawl/sidecar.yml'), 'utf8'))
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

  it('parses shipped openjev api publish 8092', () => {
    const raw = parseYaml(readFileSync(join(import.meta.dirname, '../../lib/sidecars/addon/openjev/sidecar.yml'), 'utf8'))
    const meta = parseSidecarMeta(raw)
    expect(meta.id).toBe('openjev')
    expect(meta.interfaces[0]).toMatchObject({
      type: 'webui',
      service: 'openjev',
      containerPort: 8080,
      publish: 8092,
      basePath: '/docs',
    })
    expect(meta.interfaces[1]).toMatchObject({
      type: 'api',
      service: 'openjev',
      containerPort: 8080,
      publish: 8092,
      basePath: '/v1',
    })
    expect(meta.interfaces[2]).toMatchObject({
      type: 'openai',
      service: 'openjev',
      containerPort: 8080,
      publish: 8092,
      basePath: '/v1',
    })
  })

  it('parses shipped whisper api publish 8090', () => {
    const raw = parseYaml(readFileSync(join(import.meta.dirname, '../../lib/sidecars/core/whisper/sidecar.yml'), 'utf8'))
    const meta = parseSidecarMeta(raw)
    expect(meta.id).toBe('whisper')
    expect(meta.interfaces[0]).toMatchObject({
      type: 'api',
      service: 'whisper',
      containerPort: 8000,
      publish: 8090,
      basePath: '/v1',
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
    expect(meta.interfaces[0].proxy).toBeUndefined()
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
      'lib/sidecars/core/ollama/docker-compose.yml',
      'lib/sidecars/addon/openwebui/docker-compose.yml',
      'lib/sidecars/addon/opencode/docker-compose.yml',
      'lib/sidecars/addon/firecrawl/docker-compose.yml',
      'lib/sidecars/addon/firecrawl-ui/docker-compose.yml',
      'lib/sidecars/addon/openjev/docker-compose.yml',
      'lib/sidecars/addon/pi/docker-compose.yml',
      'lib/sidecars/core/whisper/docker-compose.yml',
      'lib/sidecars/core/desktop/docker-compose.yml',
    ]) {
      const yml = readFileSync(join(root, rel), 'utf8')
      expect(yml).toMatch(/\n\s+bros:\s*\n\s+external:\s*true/m)
    }
    expect(composeUsesDesktopNetns(join(root, 'lib/sidecars/core/desktop'))).toBe(false)
    expect(shouldAttachProjectNetwork(join(root, 'lib/sidecars/core/desktop'))).toBe(true)
    expect(shouldBuildSidecarImage(true, false)).toBe(false)
    expect(shouldBuildSidecarImage(true, true)).toBe(true)
    expect(shouldBuildSidecarImage(false, false)).toBe(true)
  })

  it('sets OLLAMA_NOPRUNE=1 on sidecar Ollama compose', () => {
    const root = join(import.meta.dirname, '../..')
    for (const rel of [
      'lib/sidecars/core/ollama/docker-compose.yml',
      'lib/sidecars/core/ollama/docker-compose.gpu.yml',
    ]) {
      const yml = readFileSync(join(root, rel), 'utf8')
      expect(yml).toMatch(/OLLAMA_NOPRUNE:\s*"1"/)
      expect(yml).not.toMatch(/OLLAMA_NOPRUNE:\s*"true"/)
    }
    expect(readFileSync(join(root, 'lib/sidecars/core/ollama/sidecar.yml'), 'utf8')).toContain('OLLAMA_NOPRUNE=1')
    expect(readFileSync(join(root, 'src/server/utils/docker.ts'), 'utf8')).toContain("OLLAMA_NOPRUNE: '1'")
  })

  it('firecrawl-ui compose publishes 3081 not 8080', () => {
    const dir = join(import.meta.dirname, '../../lib/sidecars/addon/firecrawl-ui')
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
    const yml = readFileSync(join(import.meta.dirname, '../../lib/sidecars/addon/firecrawl/docker-compose.yml'), 'utf8')
    expect(yml).toContain('${BROS_FIRECRAWL_PORT:-3002}:3002')
    expect(yml).not.toMatch(/-\s+["']?3000:/)
    expect(yml).not.toContain('foundationdb')
    expect(yml).toContain('USE_DB_AUTHENTICATION: "false"')
    expect(yml).toContain('ALLOW_LOCAL_WEBHOOKS: "true"')
    expect(yml).toContain('TEST_SUITE_SELF_HOSTED: "true"')
    expect(yml).toContain('OLLAMA_BASE_URL: http://ollama:11434')
  })

  it('pi compose is CLI only on the Bros node base', () => {
    const dir = join(import.meta.dirname, '../../lib/sidecars/addon/pi')
    const yml = readFileSync(join(dir, 'docker-compose.yml'), 'utf8')
    const meta = readFileSync(join(dir, 'sidecar.yml'), 'utf8')
    expect(yml).toContain('image: bros-pi')
    expect(yml).not.toMatch(/ports:/)
    expect(readFileSync(join(dir, 'Dockerfile'), 'utf8')).toContain('FROM node:22-bookworm-slim')
    expect(readFileSync(join(dir, 'Dockerfile'), 'utf8')).toContain('@earendil-works/pi-coding-agent@1.2.0')
    expect(meta).toContain('type: cli')
    expect(meta).toContain('command: pi')
  })

  it('openjev compose publishes 8092 not 8080 and pins Hub images', () => {
    const yml = readFileSync(join(import.meta.dirname, '../../lib/sidecars/addon/openjev/docker-compose.yml'), 'utf8')
    expect(yml).toContain('${BROS_OPENJEV_PORT:-8092}:8080')
    expect(yml).toContain('OPENJEV_HOST: "0.0.0.0"')
    expect(yml).toContain('OPENJEV_GPU_UTIL: ${OPENJEV_GPU_UTIL:-0.80}')
    expect(yml).toContain('OPENJEV_VLLM_ARGS: ${OPENJEV_VLLM_ARGS:---kv-cache-dtype bfloat16}')
    expect(yml).toContain('OPENJEV_DEVICE: ${OPENJEV_DEVICE:-cpu}')
    expect(yml).toContain('razorback16/openjev:0.5.0')
    expect(yml).toContain('razorback16/openjev-laya:0.5.0')
    expect(yml).toContain('razorback16/openjev-verdict:0.5.0')
    expect(yml).toContain('gpus: all')
    expect(yml).toContain('ipc: host')
    expect(yml).toContain('http://127.0.0.1:8080/health')
    expect(yml).toContain('HOME: /home/bros')
    expect(yml).toContain('home/.cache/huggingface:/home/bros/.cache/huggingface')
    expect(yml).not.toMatch(/-\s+["']?8080:/)
    expect(yml).not.toMatch(/-\s+["']?3000:/)
  })

  it('runs every service as the overridable host uid and gid', () => {
    const root = join(import.meta.dirname, '../..')
    const user = '${BROS_HOST_UID:-1000}:${BROS_HOST_GID:-1000}'
    for (const rel of [
      'docker-compose.yml',
      'lib/sidecars/core/ollama/docker-compose.yml',
      'lib/sidecars/core/whisper/docker-compose.yml',
      'lib/sidecars/addon/opencode/docker-compose.yml',
      'lib/sidecars/addon/openwebui/docker-compose.yml',
      'lib/sidecars/addon/firecrawl/docker-compose.yml',
      'lib/sidecars/addon/firecrawl-ui/docker-compose.yml',
      'lib/sidecars/addon/openjev/docker-compose.yml',
      'lib/sidecars/addon/pi/docker-compose.yml',
    ]) {
      const doc = parseYaml(readFileSync(join(root, rel), 'utf8')) as { services?: Record<string, { user?: string }> }
      for (const [name, svc] of Object.entries(doc.services || {})) {
        if (name === 'rabbitmq' || name === 'nuq-postgres') {
          expect(svc.user, `${rel} ${name}`).toBe('0:0')
          continue
        }
        expect(svc.user, `${rel} ${name}`).toBe(user)
      }
    }
    const desktop = readFileSync(join(root, 'lib/sidecars/core/desktop/docker-compose.yml'), 'utf8')
    expect(desktop).toContain('PUID: "${BROS_HOST_UID:-1000}"')
    expect(desktop).toContain('PGID: "${BROS_HOST_GID:-1000}"')
    expect(desktop).not.toContain('sidecars/cursor/state')
    expect(desktop).not.toContain('sidecars/opencode/config')
    expect(desktop).toContain('${BROS_HOST_DATA_DIR:?unset}/home:/home/bros')
    expect(desktop).toContain('PATH: /home/bros/.local/sidecar-bins:')
    expect(desktop).toContain('"${BROS_DOCKER_GID:-0}"')
    expect(desktop).toContain('${BROS_HOST_REPO:?unset}/lib/sidecars/core/desktop/root/custom-cont-init.d/bros-live:/custom-cont-init.d/bros-live:ro')
    expect(desktop).not.toMatch(/^\s+user:/m)
    const live = readFileSync(join(root, 'lib/sidecars/core/desktop/root/custom-cont-init.d/bros-live'), 'utf8')
    expect(live).toContain("/var/run/docker.sock")
    expect(live).toContain('usermod -aG "$name" abc')
    expect(live).toContain('foot --working-directory=/home/bros/workspace')
    expect(live).toContain('s|^foot.*|')
    expect(live).toContain('/usr/local/bin/$name')
    expect(live).toContain('${session}.bak')
    const gui = readFileSync(join(root, 'lib/sidecars/core/desktop/desktop-gui.sh'), 'utf8')
    expect(gui).toContain('HOME=/home/bros')
    expect(gui).toContain('desktop app failed to start')
  })

  it('starts the browser terminal as user bros in the desktop workspace', () => {
    const root = join(import.meta.dirname, '../..')
    const desktop = readFileSync(join(root, 'lib/sidecars/core/desktop/docker-compose.yml'), 'utf8')
    const ttyd = readFileSync(join(root, 'lib/sidecars/core/desktop/root/custom-services.d/ttyd'), 'utf8')
    expect(desktop).toContain('hostname: bros')
    expect(desktop).toContain('${BROS_HOST_WORKSPACE:?unset}:/home/bros/workspace')
    expect(ttyd).toContain('useradd --no-create-home --home-dir /home/bros --shell /bin/bash --gid "${PGID:-1000}" bros')
    expect(ttyd).toContain('-w /home/bros/workspace -u "$uid" -g "$gid"')
    expect(ttyd).toContain('printf "~/workspace"')
    expect(ttyd).toContain('-- bash --rcfile /run/bros-terminal.bashrc -i')
  })

  it('mounts ollama models under the desktop home', () => {
    const yml = readFileSync(join(import.meta.dirname, '../..', 'lib/sidecars/core/ollama/docker-compose.yml'), 'utf8')
    expect(yml).toContain('${BROS_HOST_DATA_DIR:?unset}/home/.ollama:/home/bros/.ollama')
    expect(yml).toContain('${BROS_HOST_DATA_DIR:?unset}/home/.config/ollama:/home/bros/.config/ollama')
    expect(yml).toContain('${BROS_HOST_DATA_DIR:?unset}/sidecars/ollama/bros-model:/bros-model:ro')
    expect(yml).not.toContain(':/root/.ollama')
    expect(yml).not.toContain('sidecars/ollama/data')
  })

  it('requires BROS_HOST_DATA_DIR in sidecar compose so empty env cannot bind /ollama', () => {
    const root = join(import.meta.dirname, '../..')
    for (const rel of [
      'lib/sidecars/core/ollama/docker-compose.yml',
      'lib/sidecars/core/ollama/docker-compose.gpu.yml',
      'lib/sidecars/addon/openwebui/docker-compose.yml',
      'lib/sidecars/addon/opencode/docker-compose.yml',
      'lib/sidecars/addon/firecrawl/docker-compose.yml',
      'lib/sidecars/addon/openjev/docker-compose.yml',
      'lib/sidecars/addon/pi/docker-compose.yml',
      'lib/sidecars/core/whisper/docker-compose.yml',
      'lib/sidecars/core/desktop/docker-compose.yml',
    ]) {
      const yml = readFileSync(join(root, rel), 'utf8')
      expect(yml).toContain('${BROS_HOST_DATA_DIR:?unset}')
      expect(yml).not.toMatch(/\$\{BROS_HOST_DATA_DIR\}\//)
      if (rel.endsWith('openwebui/docker-compose.yml')) {
        expect(yml).toContain('WEBUI_SECRET_KEY_FILE: /app/backend/data/.webui_secret_key')
      }
    }
  })
})
