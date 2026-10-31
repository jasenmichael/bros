import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { composeImageIsLocal, composeUsesDesktopNetns, dockerConfigDir, isMissingHostDataBind, shouldAttachProjectNetwork, shouldBuildDockerAppImage } from '../../app/server/utils/docker'
import { isReservedDockerAppId, parseDockerAppMeta, projectName, RESERVED_SLUGS } from '../../app/server/utils/docker-app/dockerApps'

describe('dockerApp project naming', () => {
  it('prefixes compose projects with bros-', () => {
    expect(projectName('ollama')).toBe('bros-ollama')
    expect(projectName('openwebui')).toBe('bros-openwebui')
  })

  it('reserves core app routes from dockerApp slugs', () => {
    expect(RESERVED_SLUGS.has('models')).toBe(true)
    expect(RESERVED_SLUGS.has('providers')).toBe(true)
    expect(RESERVED_SLUGS.has('api')).toBe(true)
    expect(RESERVED_SLUGS.has('status')).toBe(true)
    expect(RESERVED_SLUGS.has('ollama')).toBe(false)
    expect(isReservedDockerAppId('ollama')).toBe(true)
    expect(isReservedDockerAppId('chat')).toBe(true)
  })

  it('requires webui publish and rejects 3000/8080', () => {
    expect(() => parseDockerAppMeta({
      id: 'demo',
      name: 'Demo',
      interfaces: [{ type: 'webui', service: 'demo', containerPort: 80 }],
    })).toThrow(/publish/)
    expect(() => parseDockerAppMeta({
      id: 'demo',
      name: 'Demo',
      interfaces: [{ type: 'webui', service: 'demo', containerPort: 80, publish: 3000 }],
    })).toThrow(/3000 or 8080/)
    expect(parseDockerAppMeta({
      id: 'demo',
      name: 'Demo',
      interfaces: [{ type: 'webui', service: 'demo', containerPort: 80, publish: 3090 }],
    }).interfaces[0].publish).toBe(3090)
    expect(parseDockerAppMeta({
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
    const raw = parseYaml(readFileSync(join(import.meta.dirname, '../../lib/apps/addon/firecrawl-ui/config.yml'), 'utf8'))
    const meta = parseDockerAppMeta(raw)
    expect(meta.id).toBe('firecrawl-ui')
    expect(meta.interfaces[0]).toMatchObject({
      type: 'webui',
      service: 'firecrawl-ui',
      containerPort: 8080,
      publish: 3081,
    })
  })

  it('parses shipped firecrawl api publish 3002', () => {
    const raw = parseYaml(readFileSync(join(import.meta.dirname, '../../lib/apps/addon/firecrawl/config.yml'), 'utf8'))
    const meta = parseDockerAppMeta(raw)
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
    const raw = parseYaml(readFileSync(join(import.meta.dirname, '../../lib/apps/addon/openjev/config.yml'), 'utf8'))
    const meta = parseDockerAppMeta(raw)
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
    const raw = parseYaml(readFileSync(join(import.meta.dirname, '../../lib/apps/core/whisper/config.yml'), 'utf8'))
    const meta = parseDockerAppMeta(raw)
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
    const meta = parseDockerAppMeta({
      id: 'ollama',
      name: 'Ollama',
      interfaces: [{ type: 'api', service: 'ollama', containerPort: 11434, publish: 11435 }],
    })
    expect(meta.interfaces[0].publish).toBe(11435)
    expect(meta.interfaces[0].containerPort).toBe(11434)
    expect(meta.interfaces[0].proxy).toBeUndefined()
  })
})

describe('dockerConfigDir', () => {
  it('prefers DOCKER_CONFIG over HOME so root PUID HOME cannot poison compose', () => {
    expect(dockerConfigDir({ DOCKER_CONFIG: '/home/bros/.docker', HOME: '/home/bros' })).toBe('/home/bros/.docker')
    expect(dockerConfigDir({ DOCKER_CONFIG: ' /root/.docker ', HOME: '/home/bros' })).toBe('/root/.docker')
    expect(dockerConfigDir({ HOME: '/home/bros' })).toBe('/home/bros/.docker')
    expect(dockerConfigDir({})).toBe('/home/bros/.docker')
  })
})

describe('dockerApp data binds', () => {
  it('treats /ollama as a missing BROS_DATA_DIR interpolation', () => {
    const hostData = '/home/me/dev/bros/data'
    expect(isMissingHostDataBind('/ollama', hostData)).toBe(true)
    expect(isMissingHostDataBind('/openwebui', hostData)).toBe(true)
    expect(isMissingHostDataBind(`${hostData}/ollama`, hostData)).toBe(false)
    expect(isMissingHostDataBind('/home/me', hostData)).toBe(false)
  })

  it('dockerApps join external network bros', () => {
    const root = join(import.meta.dirname, '../..')
    for (const rel of [
      'lib/apps/core/ollama/docker-compose.yml',
      'lib/apps/addon/openwebui/docker-compose.yml',
      'lib/apps/addon/firecrawl/docker-compose.yml',
      'lib/apps/addon/firecrawl-ui/docker-compose.yml',
      'lib/apps/addon/openjev/docker-compose.yml',
      'lib/apps/addon/pi/docker-compose.yml',
      'lib/apps/addon/omniroute/docker-compose.yml',
      'lib/apps/core/whisper/docker-compose.yml',
      'lib/desktop/docker-compose.yml',
    ]) {
      const yml = readFileSync(join(root, rel), 'utf8')
      expect(yml).toMatch(/\n\s+bros:\s*\n\s+external:\s*true/m)
    }
    expect(composeUsesDesktopNetns(join(root, 'lib/desktop'))).toBe(false)
    expect(shouldAttachProjectNetwork(join(root, 'lib/desktop'))).toBe(true)
    expect(shouldBuildDockerAppImage(true, false)).toBe(false)
    expect(shouldBuildDockerAppImage(true, true)).toBe(true)
    expect(shouldBuildDockerAppImage(false, false)).toBe(true)
  })

  it('treats a build with no registry image as local', () => {
    const root = join(import.meta.dirname, '../..')
    for (const rel of [
      'lib/desktop/docker-compose.yml',
      'lib/apps/addon/pi/docker-compose.yml',
      'lib/apps/addon/firecrawl-ui/docker-compose.yml',
    ]) {
      expect(composeImageIsLocal(readFileSync(join(root, rel), 'utf8'))).toBe(true)
    }
    for (const rel of [
      'lib/apps/core/ollama/docker-compose.yml',
      'lib/apps/core/whisper/docker-compose.yml',
      'lib/apps/addon/omniroute/docker-compose.yml',
    ]) {
      expect(composeImageIsLocal(readFileSync(join(root, rel), 'utf8'))).toBe(false)
    }
    expect(composeImageIsLocal('services:\n  app:\n    build: .\n')).toBe(true)
  })

  it('sets OLLAMA_NOPRUNE=1 on dockerApp Ollama compose', () => {
    const root = join(import.meta.dirname, '../..')
    for (const rel of [
      'lib/apps/core/ollama/docker-compose.yml',
      'lib/apps/core/ollama/docker-compose.gpu.yml',
    ]) {
      const yml = readFileSync(join(root, rel), 'utf8')
      expect(yml).toMatch(/OLLAMA_NOPRUNE:\s*"1"/)
      expect(yml).not.toMatch(/OLLAMA_NOPRUNE:\s*"true"/)
    }
    expect(readFileSync(join(root, 'lib/apps/core/ollama/config.yml'), 'utf8')).toContain('kind: docker')
    expect(readFileSync(join(root, 'app/server/utils/docker.ts'), 'utf8')).toContain("OLLAMA_NOPRUNE: '1'")
  })

  it('firecrawl-ui compose publishes 3081 not 8080', () => {
    const dir = join(import.meta.dirname, '../../lib/apps/addon/firecrawl-ui')
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
    const yml = readFileSync(join(import.meta.dirname, '../../lib/apps/addon/firecrawl/docker-compose.yml'), 'utf8')
    expect(yml).toContain('${BROS_FIRECRAWL_PORT:-3002}:3002')
    expect(yml).toContain('/apps/firecrawl/')
    expect(yml).not.toContain('/dockerApps/firecrawl/')
    expect(yml).not.toMatch(/-\s+["']?3000:/)
    expect(yml).not.toContain('foundationdb')
    expect(yml).toContain('USE_DB_AUTHENTICATION: "false"')
    expect(yml).toContain('ALLOW_LOCAL_WEBHOOKS: "true"')
    expect(yml).toContain('TEST_SUITE_SELF_HOSTED: "true"')
    expect(yml).toContain('OLLAMA_BASE_URL: http://ollama:11434')
  })

  it('pi compose is CLI only on the Bros node base', () => {
    const dir = join(import.meta.dirname, '../../lib/apps/addon/pi')
    const yml = readFileSync(join(dir, 'docker-compose.yml'), 'utf8')
    const meta = readFileSync(join(dir, 'config.yml'), 'utf8')
    expect(yml).toContain('image: bros-pi')
    expect(yml).not.toMatch(/ports:/)
    expect(readFileSync(join(dir, 'Dockerfile'), 'utf8')).toContain('FROM node:22-bookworm-slim')
    expect(readFileSync(join(dir, 'Dockerfile'), 'utf8')).toContain('@earendil-works/pi-coding-agent@1.2.0')
    expect(meta).toContain('type: cli')
    expect(meta).toContain('command: pi')
  })

  it('omniroute publishes 20128 and keeps provider config out of the pack', () => {
    const dir = join(import.meta.dirname, '../../lib/apps/addon/omniroute')
    const yml = readFileSync(join(dir, 'docker-compose.yml'), 'utf8')
    const meta = readFileSync(join(dir, 'config.yml'), 'utf8')
    expect(yml).toContain('diegosouzapw/omniroute:3.8.52')
    expect(yml).toContain('${BROS_OMNIROUTE_PORT:-20128}:20128')
    expect(yml).toContain('REQUIRE_API_KEY: "true"')
    expect(yml).toContain('redis://omniroute-redis:6379')
    expect(yml).toContain('/apps/omniroute/')
    expect(yml).not.toContain('/dockerApps/omniroute/')
    expect(yml).not.toMatch(/ports:[\s\S]*6379:/)
    expect(yml).not.toMatch(/sk-/)
    expect(meta).toContain('type: openai')
    expect(meta).toContain('basePath: /v1')
    expect(meta).toContain('publish: 20128')
    expect(meta).not.toMatch(/^home:/m)
  })

  it('openjev compose publishes 8092 not 8080 and pins Hub images', () => {
    const yml = readFileSync(join(import.meta.dirname, '../../lib/apps/addon/openjev/docker-compose.yml'), 'utf8')
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
      'lib/apps/core/ollama/docker-compose.yml',
      'lib/apps/core/whisper/docker-compose.yml',
      'lib/apps/addon/openwebui/docker-compose.yml',
      'lib/apps/addon/firecrawl/docker-compose.yml',
      'lib/apps/addon/firecrawl-ui/docker-compose.yml',
      'lib/apps/addon/openjev/docker-compose.yml',
      'lib/apps/addon/pi/docker-compose.yml',
      'lib/apps/addon/omniroute/docker-compose.yml',
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
    const desktop = readFileSync(join(root, 'lib/desktop/docker-compose.yml'), 'utf8')
    expect(desktop).toContain('PUID: "${BROS_HOST_UID:-1000}"')
    expect(desktop).toContain('PGID: "${BROS_HOST_GID:-1000}"')
    expect(desktop).not.toContain('dockerApps/cursor/state')
    expect(desktop).not.toContain('dockerApps/opencode/config')
    expect(desktop).toContain('${BROS_DATA_DIR:?unset}/home:/home/bros')
    expect(desktop).not.toContain('.nix-profile/bin:')
    expect(readFileSync(join(root, 'lib/desktop/root/etc/profile.d/bros-path.sh'), 'utf8')).toContain('export PATH="/home/bros/.local/app-bins:${PATH}"')
    expect(desktop).toContain('"${BROS_DOCKER_GID:-0}"')
    expect(desktop).toContain('${BROS_HOST_REPO:?unset}/lib/desktop/root/custom-cont-init.d/bros-live:/custom-cont-init.d/bros-live:ro')
    expect(desktop).not.toMatch(/^\s+user:/m)
    const live = readFileSync(join(root, 'lib/desktop/root/custom-cont-init.d/bros-live'), 'utf8')
    expect(live).toContain("/var/run/docker.sock")
    expect(live).toContain('useradd --non-unique')
    expect(live).toContain('usermod -aG "$name" abc')
    expect(live).toContain('foot --working-directory=/home/bros/workspace')
    expect(live).toContain('s|^foot.*|')
    expect(live).toContain('/usr/local/bin/$name')
    expect(live).toContain('${session}.bak')
    expect(live).not.toContain('/usr/local/bin/cursor')
    expect(live).toContain('install_launch')
    expect(live).toContain('/app/lib/apps/addon/*')
    expect(live).not.toContain('/usr/share/cursor/cursor --no-sandbox')
    expect(live).toContain('export LIBGL_ALWAYS_SOFTWARE=1')
    expect(live).not.toContain('LD_LIBRARY_PATH')
    const cursorLaunch = readFileSync(join(root, 'lib/apps/addon/cursor/launch.sh'), 'utf8')
    expect(cursorLaunch).toContain('/usr/share/cursor/cursor --no-sandbox --ozone-platform=x11')
    expect(cursorLaunch).toContain('GDK_BACKEND="${GDK_BACKEND:-x11}"')
    expect(cursorLaunch).toContain('ELECTRON_OZONE_PLATFORM_HINT="${ELECTRON_OZONE_PLATFORM_HINT:-x11}"')
    expect(cursorLaunch).toContain('GTK_USE_PORTAL="${GTK_USE_PORTAL:-1}"')
    expect(cursorLaunch).toContain('bros-portals.sh')
    const ghosttyLaunch = readFileSync(join(root, 'lib/apps/addon/ghostty/launch.sh'), 'utf8')
    expect(ghosttyLaunch).toContain('LIBGL_ALWAYS_SOFTWARE=1')
    expect(ghosttyLaunch).toContain('__EGL_VENDOR_LIBRARY_FILENAMES=/home/bros/.local/lib/ghostty-mesa.json')
    expect(readFileSync(join(root, 'lib/desktop/ensure.sh'), 'utf8')).toContain("grep -v '/[.]local/app-bins")
    expect(live).toContain('serverDecoration="no"')
    expect(live).toContain('bros-portals.sh')
    expect(live).toContain('DBUS_SESSION_BUS_ADDRESS=unix:path=/home/bros/.XDG/bus')
    expect(live).toContain('xdg-desktop-portal-gtk')
    expect(live).toContain('UnMaximize')
    expect(live).toContain('bros-gtk-theme.sh')
    expect(live).toContain('GTK_THEME=Adwaita-dark')
    const coreApt = readFileSync(join(root, 'lib/desktop/core-apt.yml'), 'utf8')
    expect(coreApt).toContain('xdg-desktop-portal-gtk')
    expect(coreApt).toContain('xdg-desktop-portal-wlr')
    expect(coreApt).toContain('gnome-themes-extra-data')
    expect(readFileSync(join(root, 'lib/desktop/root/usr/local/bin/bros-portals.sh'), 'utf8')).toContain('xdg-desktop-portal-gtk')
    expect(readFileSync(join(root, 'lib/desktop/root/usr/local/bin/bros-gtk-theme.sh'), 'utf8')).toContain('Adwaita-dark')
    expect(readFileSync(join(root, 'lib/desktop/root/etc/gtk-3.0/settings.ini'), 'utf8')).toContain('prefer-dark-theme=1')
    const gui = readFileSync(join(root, 'lib/desktop/desktop-gui.sh'), 'utf8')
    expect(gui).toContain('HOME=/home/bros')
    expect(gui).toContain('devbox global shellenv --init-hook')
    expect(gui).toContain('export LIBGL_ALWAYS_SOFTWARE=1')
    expect(gui).toContain('GDK_BACKEND="$GDK_BACKEND_VALUE"')
    expect(gui).toContain('ELECTRON_OZONE_PLATFORM_HINT="$ELECTRON_OZONE_HINT_VALUE"')
    expect(gui).toContain('GDK_BACKEND_VALUE=x11')
    expect(gui).toContain('DBUS_SESSION_BUS_ADDRESS="$DBUS_VALUE"')
    expect(gui).toContain('GTK_USE_PORTAL="$GTK_USE_PORTAL_VALUE"')
    expect(gui).not.toContain('LD_LIBRARY_PATH')
    expect(gui).toContain('RUNTIME_VALUE=/home/bros/.XDG')
    expect(gui).not.toContain('BROS_GUI_LAUNCH')
    expect(gui).toContain('desktop app failed to start')
    expect(gui.slice(gui.indexOf('start) ;;'))).not.toContain('stop_one')
    expect(gui).toContain('w/$n/pid')
    expect(gui).toContain('focus_one')
    expect(gui).toContain('desktop-gui.sh status')
    expect(gui).toContain('Mapped windows only. Live PIDs without a labwc map do not count.')
    expect(gui).not.toContain('echo "$words"')
    const win = spawnSync('python3', [join(root, 'lib/desktop/desktop-win.py'), '--self-check'], { encoding: 'utf8' })
    expect(win.status, win.stderr).toBe(0)
  })

  it('starts the browser terminal as user bros in the desktop workspace', () => {
    const root = join(import.meta.dirname, '../..')
    const desktop = readFileSync(join(root, 'lib/desktop/docker-compose.yml'), 'utf8')
    const ttyd = readFileSync(join(root, 'lib/desktop/root/custom-services.d/ttyd'), 'utf8')
    expect(desktop).toContain('hostname: bros')
    expect(desktop).toContain('${BROS_WORKSPACE:?unset}:/home/bros/workspace')
    expect(ttyd).not.toContain('useradd')
    expect(ttyd).toContain('-w /home/bros/workspace -u "$uid" -g "$gid"')
    expect(ttyd).toContain('printf "~/workspace"')
    expect(ttyd).toContain('-- bash --rcfile /run/bros-terminal.bashrc -i')
  })

  it('mounts ollama models under the desktop home', () => {
    const yml = readFileSync(join(import.meta.dirname, '../..', 'lib/apps/core/ollama/docker-compose.yml'), 'utf8')
    expect(yml).toContain('${BROS_DATA_DIR:?unset}/home/.ollama:/home/bros/.ollama')
    expect(yml).toContain('${BROS_DATA_DIR:?unset}/home/.config/ollama:/home/bros/.config/ollama')
    expect(yml).toContain('${BROS_DATA_DIR:?unset}/apps/ollama/bros-model:/bros-model:ro')
    expect(yml).not.toContain(':/root/.ollama')
    expect(yml).not.toContain('dockerApps/ollama/data')
  })

  it('requires BROS_DATA_DIR in dockerApp compose so empty env cannot bind /ollama', () => {
    const root = join(import.meta.dirname, '../..')
    for (const rel of [
      'lib/apps/core/ollama/docker-compose.yml',
      'lib/apps/core/ollama/docker-compose.gpu.yml',
      'lib/apps/addon/openwebui/docker-compose.yml',
      'lib/apps/addon/firecrawl/docker-compose.yml',
      'lib/apps/addon/openjev/docker-compose.yml',
      'lib/apps/addon/pi/docker-compose.yml',
      'lib/apps/addon/omniroute/docker-compose.yml',
      'lib/apps/core/whisper/docker-compose.yml',
      'lib/desktop/docker-compose.yml',
    ]) {
      const yml = readFileSync(join(root, rel), 'utf8')
      expect(yml).toContain('${BROS_DATA_DIR:?unset}')
      expect(yml).not.toMatch(/\$\{BROS_DATA_DIR\}\//)
      if (rel.endsWith('openwebui/docker-compose.yml')) {
        expect(yml).toContain('WEBUI_SECRET_KEY_FILE: /app/backend/data/.webui_secret_key')
      }
    }
  })
})
