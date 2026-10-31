import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const REPO = join(import.meta.dirname, '../..')
const TUNNEL_SH = join(REPO, 'scripts/bros-tunnel.sh')
const HELPER_SH = join(REPO, 'scripts/bros-tunnel-helper.sh')

function bash(script: string, env: NodeJS.ProcessEnv = {}) {
  const merged: NodeJS.ProcessEnv = { ...process.env, ...env }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete merged[key]
  }
  return execFileSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: merged,
  })
}

describe('public_url tunnel startup', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('named tunnel clears host TUNNEL_TOKEN before cloudflared run', () => {
    const helper = readFileSync(HELPER_SH, 'utf8')
    const named = helper.slice(helper.indexOf('start_named()'), helper.indexOf('\nparse_hostname'))
    expect(named).toContain('unset TUNNEL_TOKEN')
    expect(named.indexOf('unset TUNNEL_TOKEN')).toBeLessThan(named.indexOf('tunnel --config'))
  })

  it('public_url alone persists hostname but does not enable', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-puburl-set-'))
    writeFileSync(join(root, 'bros.yml'), 'working_dir: .\ndata_dir: ./data\npublic_url: "https://bros.example.com"\n')
    const out = bash(
      `set -euo pipefail
       source "${TUNNEL_SH}"
       bros_tunnel_apply_public_url
       if bros_tunnel_want_enabled; then echo WANT_START; else echo NO_START; fi
       cat "$(bros_tunnel_dir)/public_url"
       cat "$(bros_tunnel_dir)/hostname"`,
      {
        BROS_DIR: root,
        BROS_DATA_DIR: join(root, 'data'),
        BROS_PUBLIC_URL: '',
        BROS_TUNNEL_HOST: '',
        BROS_TUNNEL: undefined,
      },
    )
    expect(out).toContain('NO_START')
    expect(out).toContain('https://bros.example.com')
    expect(out).toContain('bros.example.com')
    expect(existsSync(join(root, 'data/var/tunnel/enabled'))).toBe(false)
  })

  it('unset tunnel → no auto-start from config', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-puburl-unset-'))
    writeFileSync(join(root, 'bros.yml'), 'working_dir: .\ndata_dir: ./data\n')
    const out = bash(
      `set -euo pipefail
       source "${TUNNEL_SH}"
       bros_tunnel_apply_public_url
       if bros_tunnel_want_enabled; then echo WANT_START; else echo NO_START; fi
       if [[ -f "$(bros_tunnel_dir)/enabled" ]]; then cat "$(bros_tunnel_dir)/enabled"; else echo NO_ENABLED; fi
       if [[ -f "$(bros_tunnel_dir)/command" ]]; then echo HAS_COMMAND; else echo NO_COMMAND; fi`,
      {
        BROS_DIR: root,
        BROS_DATA_DIR: join(root, 'data'),
        BROS_PUBLIC_URL: '',
        BROS_TUNNEL_HOST: '',
        BROS_TUNNEL: undefined,
      },
    )
    expect(out).toContain('NO_START')
    expect(out).toContain('NO_ENABLED')
    expect(out).toContain('NO_COMMAND')
    expect(existsSync(join(root, 'data/var/tunnel/command'))).toBe(false)
  })

  it('BROS_TUNNEL=1 + BROS_TUNNEL_HOST → want start with named host', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-puburl-host-'))
    writeFileSync(join(root, 'bros.yml'), 'working_dir: .\ndata_dir: ./data\n')
    const out = bash(
      `set -euo pipefail
       source "${TUNNEL_SH}"
       bros_tunnel_apply_public_url
       if bros_tunnel_want_enabled; then echo WANT_START; else echo NO_START; fi
       cat "$(bros_tunnel_dir)/hostname"`,
      {
        BROS_DIR: root,
        BROS_DATA_DIR: join(root, 'data'),
        BROS_PUBLIC_URL: '',
        BROS_TUNNEL: '1',
        BROS_TUNNEL_HOST: 'bros.example.com',
      },
    )
    expect(out).toContain('WANT_START')
    expect(out).toContain('bros.example.com')
  })

  it('BROS_TUNNEL=0 + public_url → no start', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-tunnel-off-'))
    writeFileSync(
      join(root, 'bros.yml'),
      'working_dir: .\ndata_dir: ./data\ntunnel: true\npublic_url: "https://bros.example.com"\n',
    )
    const out = bash(
      `set -euo pipefail
       source "${TUNNEL_SH}"
       bros_tunnel_apply_public_url
       if bros_tunnel_want_enabled; then echo WANT_START; else echo NO_START; fi`,
      {
        BROS_DIR: root,
        BROS_DATA_DIR: join(root, 'data'),
        BROS_PUBLIC_URL: '',
        BROS_TUNNEL_HOST: '',
        BROS_TUNNEL: '0',
      },
    )
    expect(out).toContain('NO_START')
  })

  it('YAML tunnel: true → want start', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-tunnel-yaml-'))
    writeFileSync(join(root, 'bros.yml'), 'working_dir: .\ndata_dir: ./data\ntunnel: true\n')
    const out = bash(
      `set -euo pipefail
       source "${TUNNEL_SH}"
       if bros_tunnel_want_enabled; then echo WANT_START; else echo NO_START; fi`,
      {
        BROS_DIR: root,
        BROS_DATA_DIR: join(root, 'data'),
        BROS_PUBLIC_URL: '',
        BROS_TUNNEL_HOST: '',
        BROS_TUNNEL: undefined,
      },
    )
    expect(out).toContain('WANT_START')
  })

  it('advertised url is the configured host, else the enabled helper url', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-puburl-adv-'))
    const dir = join(root, 'data/var/tunnel')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'enabled'), '0\n')
    writeFileSync(join(dir, 'public_url'), 'https://quick.trycloudflare.com\n')
    const out = bash(
      `set -euo pipefail
       source "${TUNNEL_SH}"
       printf '%s\n' "off=$(bros_tunnel_advertised_url)"
       printf '1\n' > "$(bros_tunnel_dir)/enabled"
       printf '%s\n' "quick=$(bros_tunnel_advertised_url)"
       printf '%s\n' "named=$(BROS_TUNNEL_HOST=bros.example.com bros_tunnel_advertised_url)"`,
      { BROS_DIR: root, BROS_DATA_DIR: join(root, 'data'), BROS_PUBLIC_URL: '', BROS_TUNNEL_HOST: '' },
    )
    expect(out).toContain('off=')
    expect(out).not.toContain('off=https://')
    expect(out).toContain('quick=https://quick.trycloudflare.com')
    expect(out).toContain('named=https://bros.example.com')
  })

  it('running helper matches only the named config hostname', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-puburl-match-'))
    const dir = join(root, 'data/var/tunnel')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'config.yml'), 'ingress:\n  - hostname: bros.example.com\n')
    const out = bash(
      `set -euo pipefail
       source "${TUNNEL_SH}"
       if bros_tunnel_running_matches; then echo MATCH; else echo MISS; fi
       BROS_PUBLIC_URL=https://other.example.com
       if bros_tunnel_running_matches; then echo MATCH2; else echo MISS2; fi
       unset BROS_PUBLIC_URL
       if bros_tunnel_running_matches; then echo QUICK; else echo NO_QUICK; fi`,
      { BROS_DIR: root, BROS_DATA_DIR: join(root, 'data'), BROS_PUBLIC_URL: 'https://bros.example.com', BROS_TUNNEL_HOST: '' },
    )
    expect(out).toContain('MATCH')
    expect(out).toContain('MISS2')
    expect(out).toContain('QUICK')
  })

  it('zone not owned → error, no cloudflared run', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-puburl-zone-'))
    const tunnelDir = join(root, 'tunnel')
    const binDir = join(root, 'bin')
    mkdirSync(tunnelDir, { recursive: true })
    mkdirSync(binDir, { recursive: true })
    writeFileSync(join(root, 'public_url'), 'https://bros.other.com\n')
    writeFileSync(join(tunnelDir, 'public_url'), 'https://bros.other.com\n')
    const fake = join(binDir, 'cloudflared')
    writeFileSync(fake, `#!/usr/bin/env bash
echo "\$@" >> "${root}/cf.args"
if [[ "\$1" == "tunnel" && "\$2" == "list" ]]; then
  printf '%s\\n' '[{"id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","name":"bros"}]'
  exit 0
fi
if [[ "\$1" == "tunnel" && "\$2" == "create" ]]; then
  echo "Created tunnel bros with id aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
  exit 0
fi
if [[ "\$1" == "tunnel" && "\$2" == "route" ]]; then
  echo "INF Added CNAME bros.other.com.not-the-account.com which will route to this tunnel"
  exit 0
fi
if [[ "\$1" == "tunnel" && ("\$2" == "--config" || "\$2" == "run") ]]; then
  echo RAN >> "${root}/cf.run"
  sleep 30
fi
exit 0
`)
    chmodSync(fake, 0o755)
    mkdirSync(join(root, '.cloudflared'), { recursive: true })
    writeFileSync(join(root, '.cloudflared', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.json'), '{}')
    const out = bash(
      `set -euo pipefail
       source "${HELPER_SH}"
       start_cf || true
       if [[ -f "${tunnelDir}/error" ]]; then cat "${tunnelDir}/error"; else echo NO_ERROR; fi
       if [[ -f "${root}/cf.run" ]]; then echo DID_RUN; else echo NO_RUN; fi`,
      {
        BROS_TUNNEL_DIR: tunnelDir,
        BROS_PORT: '3055',
        HOME: root,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    )
    expect(out).toMatch(/does not own the DNS zone/)
    expect(out).toContain('NO_RUN')
  })

  it('start failure → error visible in status.json', async () => {
    root = mkdtempSync(join(tmpdir(), 'bros-puburl-fail-'))
    const tunnelDir = join(root, 'tunnel')
    mkdirSync(tunnelDir, { recursive: true })
    const child = spawn('bash', [HELPER_SH], {
      env: {
        ...process.env,
        BROS_TUNNEL_DIR: tunnelDir,
        BROS_PORT: '3055',
        HOME: root,
        PATH: '/usr/bin:/bin',
      },
      stdio: 'ignore',
    })
    try {
      writeFileSync(join(tunnelDir, 'enabled'), '1\n')
      writeFileSync(join(tunnelDir, 'command'), 'start\n')
      const deadline = Date.now() + 8000
      let status = ''
      while (Date.now() < deadline) {
        const file = join(tunnelDir, 'status.json')
        if (existsSync(file)) {
          status = readFileSync(file, 'utf8')
          if (status.includes('"error":') && !status.includes('"error":null')) break
        }
        await new Promise(r => setTimeout(r, 200))
      }
      expect(status).toMatch(/cloudflared is not installed/i)
      const parsed = JSON.parse(status) as { error: string | null; running: boolean }
      expect(parsed.running).toBe(false)
      expect(parsed.error).toMatch(/cloudflared is not installed/i)
    }
    finally {
      child.kill('SIGTERM')
    }
  })

  it('write_status keeps QUIC errors while the pid is alive', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-status-quic-'))
    const tunnelDir = join(root, 'tunnel')
    mkdirSync(tunnelDir, { recursive: true })
    const out = bash(
      `set -euo pipefail
       source "${HELPER_SH}"
       echo $$ > "${tunnelDir}/cloudflared.pid"
       cat > "${tunnelDir}/logs.txt" <<'LOG'
2026-09-17T19:00:00Z INF Registered tunnel connection protocol=quic connIndex=0
2026-09-17T19:00:10Z WRN failed to accept QUIC stream: timeout: no recent network activity
2026-09-17T19:00:10Z ERR failed to serve tunnel connection error="accept stream listener encountered a failure while serving"
LOG
       write_status
       cat "${tunnelDir}/status.json"`,
      { BROS_TUNNEL_DIR: tunnelDir, BROS_PORT: '3055', HOME: root, PATH: '/usr/bin:/bin' },
    )
    const parsed = JSON.parse(out.slice(out.indexOf('{'))) as { running: boolean; error: string | null }
    expect(parsed.running).toBe(true)
    expect(parsed.error).toMatch(/failed to (accept QUIC stream|serve tunnel connection)/)
  })

  it('write_status clears runtime error after a later register', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-status-ok-'))
    const tunnelDir = join(root, 'tunnel')
    mkdirSync(tunnelDir, { recursive: true })
    const out = bash(
      `set -euo pipefail
       source "${HELPER_SH}"
       echo $$ > "${tunnelDir}/cloudflared.pid"
       cat > "${tunnelDir}/logs.txt" <<'LOG'
2026-09-17T19:00:10Z ERR failed to accept QUIC stream: timeout: no recent network activity
2026-09-17T19:00:20Z INF Registered tunnel connection protocol=http2 connIndex=0
LOG
       write_status
       cat "${tunnelDir}/status.json"`,
      { BROS_TUNNEL_DIR: tunnelDir, BROS_PORT: '3055', HOME: root, PATH: '/usr/bin:/bin' },
    )
    const parsed = JSON.parse(out.slice(out.indexOf('{'))) as { running: boolean; error: string | null }
    expect(parsed.running).toBe(true)
    expect(parsed.error).toBeNull()
  })

  it('named run passes --protocol http2 by default', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-proto-http2-'))
    const tunnelDir = join(root, 'tunnel')
    const binDir = join(root, 'bin')
    mkdirSync(tunnelDir, { recursive: true })
    mkdirSync(binDir, { recursive: true })
    writeFileSync(join(tunnelDir, 'public_url'), 'https://bros.example.com\n')
    const fake = join(binDir, 'cloudflared')
    writeFileSync(fake, `#!/usr/bin/env bash
echo "\$@" >> "${root}/cf.args"
if [[ "\$1" == "tunnel" && "\$2" == "list" ]]; then
  printf '%s\\n' '[{"id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","name":"bros"}]'
  exit 0
fi
if [[ "\$1" == "tunnel" && "\$2" == "route" ]]; then
  echo "INF Added CNAME bros.example.com which will route to this tunnel"
  exit 0
fi
if [[ "\$*" == *run* || "\$*" == *--config* ]]; then
  echo RAN >> "${root}/cf.run"
  sleep 30
fi
exit 0
`)
    chmodSync(fake, 0o755)
    mkdirSync(join(root, '.cloudflared'), { recursive: true })
    writeFileSync(join(root, '.cloudflared', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.json'), '{}')
    writeFileSync(join(root, '.cloudflared', 'cert.pem'), 'x')
    bash(
      `set -euo pipefail
       source "${HELPER_SH}"
       start_cf || true`,
      {
        BROS_TUNNEL_DIR: tunnelDir,
        BROS_PORT: '3055',
        HOME: root,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    )
    const args = readFileSync(join(root, 'cf.args'), 'utf8')
    expect(args).toMatch(/--config /)
    expect(args).toMatch(/ run bros(?:\s|$)/)
    expect(readFileSync(join(tunnelDir, 'config.yml'), 'utf8')).toMatch(/^protocol: http2$/m)
    expect(readFileSync(join(tunnelDir, 'config.yml'), 'utf8')).toMatch(/^edge-ip-version: "4"$/m)
    expect(readFileSync(join(tunnelDir, 'config.yml'), 'utf8')).toMatch(/hostname: bros\.example\.com/)
    expect(readFileSync(join(tunnelDir, 'config.yml'), 'utf8')).toMatch(/service: http_status:404/)
    expect(existsSync(join(root, 'cf.run'))).toBe(true)
  })

  it('BROS_TUNNEL_PROTOCOL=quic overrides the default', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-proto-quic-'))
    const tunnelDir = join(root, 'tunnel')
    const binDir = join(root, 'bin')
    mkdirSync(tunnelDir, { recursive: true })
    mkdirSync(binDir, { recursive: true })
    writeFileSync(join(tunnelDir, 'public_url'), 'https://bros.example.com\n')
    const fake = join(binDir, 'cloudflared')
    writeFileSync(fake, `#!/usr/bin/env bash
echo "\$@" >> "${root}/cf.args"
if [[ "\$1" == "tunnel" && "\$2" == "list" ]]; then
  printf '%s\\n' '[{"id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","name":"bros"}]'
  exit 0
fi
if [[ "\$1" == "tunnel" && "\$2" == "route" ]]; then
  echo "INF Added CNAME bros.example.com which will route to this tunnel"
  exit 0
fi
if [[ "\$*" == *run* || "\$*" == *--config* ]]; then
  sleep 30
fi
exit 0
`)
    chmodSync(fake, 0o755)
    mkdirSync(join(root, '.cloudflared'), { recursive: true })
    writeFileSync(join(root, '.cloudflared', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.json'), '{}')
    writeFileSync(join(root, '.cloudflared', 'cert.pem'), 'x')
    bash(
      `set -euo pipefail
       source "${HELPER_SH}"
       start_cf || true`,
      {
        BROS_TUNNEL_DIR: tunnelDir,
        BROS_PORT: '3055',
        HOME: root,
        PATH: `${binDir}:/usr/bin:/bin`,
        BROS_TUNNEL_PROTOCOL: 'quic',
      },
    )
    expect(readFileSync(join(root, 'cf.args'), 'utf8')).toMatch(/ run bros(?:\s|$)/)
    expect(readFileSync(join(tunnelDir, 'config.yml'), 'utf8')).toMatch(/^protocol: quic$/m)
  })

  it('route dns timeout still starts the named tunnel', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-route-timeout-'))
    const tunnelDir = join(root, 'tunnel')
    const binDir = join(root, 'bin')
    mkdirSync(tunnelDir, { recursive: true })
    mkdirSync(binDir, { recursive: true })
    writeFileSync(join(tunnelDir, 'public_url'), 'https://bros.example.com\n')
    const fake = join(binDir, 'cloudflared')
    writeFileSync(fake, `#!/usr/bin/env bash
if [[ "\$1" == "tunnel" && "\$2" == "list" ]]; then
  printf '%s\\n' '[{"id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","name":"bros"}]'
  exit 0
fi
if [[ "\$1" == "tunnel" && "\$2" == "route" ]]; then
  sleep 8
  echo "INF Added CNAME bros.example.com which will route to this tunnel"
  exit 0
fi
if [[ "\$*" == *run* || "\$*" == *--config* ]]; then
  echo RAN >> "${root}/cf.run"
  sleep 30
fi
exit 0
`)
    chmodSync(fake, 0o755)
    mkdirSync(join(root, '.cloudflared'), { recursive: true })
    writeFileSync(join(root, '.cloudflared', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.json'), '{}')
    writeFileSync(join(root, '.cloudflared', 'cert.pem'), 'x')
    bash(
      `set -euo pipefail
       source "${HELPER_SH}"
       start_cf || true
       if [[ -f "${root}/cf.run" ]]; then echo DID_RUN; else echo NO_RUN; fi`,
      {
        BROS_TUNNEL_DIR: tunnelDir,
        BROS_PORT: '3055',
        HOME: root,
        PATH: `${binDir}:/usr/bin:/bin`,
        BROS_TUNNEL_ROUTE_TIMEOUT: '1',
      },
    )
    expect(existsSync(join(root, 'cf.run'))).toBe(true)
    expect(readFileSync(join(tunnelDir, 'error'), 'utf8')).toMatch(/cloudflared tunnel route dns timed out/)
    expect(readFileSync(join(tunnelDir, 'error'), 'utf8')).toMatch(/cfargotunnel\.com/)
    expect(readFileSync(join(tunnelDir, 'error'), 'utf8')).not.toMatch(/PUT .*\/routes/)
  })

  it('route dns REST timeout still starts and does not use the PUT URL as the only error', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-route-rest-'))
    const tunnelDir = join(root, 'tunnel')
    const binDir = join(root, 'bin')
    mkdirSync(tunnelDir, { recursive: true })
    mkdirSync(binDir, { recursive: true })
    writeFileSync(join(tunnelDir, 'public_url'), 'https://bros.jasenmichael.com\n')
    const fake = join(binDir, 'cloudflared')
    writeFileSync(fake, `#!/usr/bin/env bash
echo "\$@" >> "${root}/cf.args"
if [[ "\$1" == "tunnel" && "\$2" == "list" ]]; then
  printf '%s\\n' '[{"id":"b880bc39-b98f-41e2-a776-fc581b353768","name":"bros"}]'
  exit 0
fi
if [[ "\$1" == "tunnel" && "\$2" == "route" ]]; then
  echo 'ERR REST request failed: Put "https://api.cloudflare.com/client/v4/zones/a2ceecc34b908eeabe5bd2b4c5dcb068/tunnels/b880bc39-b98f-41e2-a776-fc581b353768/routes": http2: timeout awaiting response headers'
  exit 1
fi
if [[ "\$*" == *run* || "\$*" == *--config* ]]; then
  echo RAN >> "${root}/cf.run"
  sleep 30
fi
exit 0
`)
    chmodSync(fake, 0o755)
    mkdirSync(join(root, '.cloudflared'), { recursive: true })
    writeFileSync(join(root, '.cloudflared', 'b880bc39-b98f-41e2-a776-fc581b353768.json'), '{}')
    writeFileSync(join(root, '.cloudflared', 'cert.pem'), 'x')
    const out = bash(
      `set -euo pipefail
       source "${HELPER_SH}"
       start_cf || true
       if [[ -f "${root}/cf.run" ]]; then echo DID_RUN; else echo NO_RUN; fi
       cat "${tunnelDir}/error"`,
      {
        BROS_TUNNEL_DIR: tunnelDir,
        BROS_PORT: '3055',
        HOME: root,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    )
    expect(out).toContain('DID_RUN')
    expect(out).toMatch(/cloudflared tunnel route dns timed out/)
    expect(out).toMatch(/b880bc39-b98f-41e2-a776-fc581b353768\.cfargotunnel\.com/)
    expect(out).toMatch(/cloudflared tunnel route dns bros bros\.jasenmichael\.com/)
    expect(out).not.toMatch(/Failed to route .* REST request failed/)
    expect(readFileSync(join(root, 'cf.args'), 'utf8')).toMatch(/tunnel route dns bros bros\.jasenmichael\.com/)
    expect(readFileSync(join(tunnelDir, 'route_warned'), 'utf8').trim()).toBe('bros.jasenmichael.com')
  })

  it('route dns already exists is success', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-route-exists-'))
    const tunnelDir = join(root, 'tunnel')
    const binDir = join(root, 'bin')
    mkdirSync(tunnelDir, { recursive: true })
    mkdirSync(binDir, { recursive: true })
    writeFileSync(join(tunnelDir, 'public_url'), 'https://bros.example.com\n')
    const fake = join(binDir, 'cloudflared')
    writeFileSync(fake, `#!/usr/bin/env bash
echo "\$@" >> "${root}/cf.args"
if [[ "\$1" == "tunnel" && "\$2" == "list" ]]; then
  printf '%s\\n' '[{"id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","name":"bros"}]'
  exit 0
fi
if [[ "\$1" == "tunnel" && "\$2" == "route" ]]; then
  echo "A CNAME record already exists for that hostname"
  exit 1
fi
if [[ "\$*" == *run* || "\$*" == *--config* ]]; then
  echo RAN >> "${root}/cf.run"
  sleep 30
fi
exit 0
`)
    chmodSync(fake, 0o755)
    mkdirSync(join(root, '.cloudflared'), { recursive: true })
    writeFileSync(join(root, '.cloudflared', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.json'), '{}')
    writeFileSync(join(root, '.cloudflared', 'cert.pem'), 'x')
    bash(
      `set -euo pipefail
       source "${HELPER_SH}"
       start_cf || true`,
      {
        BROS_TUNNEL_DIR: tunnelDir,
        BROS_PORT: '3055',
        HOME: root,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    )
    expect(existsSync(join(root, 'cf.run'))).toBe(true)
    expect(existsSync(join(tunnelDir, 'error'))).toBe(false)
    expect(readFileSync(join(tunnelDir, 'routed'), 'utf8').trim()).toBe('bros.example.com')
  })

  it('always runs official route dns even when routed marker matches', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-route-skip-'))
    const tunnelDir = join(root, 'tunnel')
    const binDir = join(root, 'bin')
    mkdirSync(tunnelDir, { recursive: true })
    mkdirSync(binDir, { recursive: true })
    writeFileSync(join(tunnelDir, 'public_url'), 'https://bros.example.com\n')
    writeFileSync(join(tunnelDir, 'routed'), 'bros.example.com\n')
    const fake = join(binDir, 'cloudflared')
    writeFileSync(fake, `#!/usr/bin/env bash
echo "\$@" >> "${root}/cf.args"
if [[ "\$1" == "tunnel" && "\$2" == "list" ]]; then
  printf '%s\\n' '[{"id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee","name":"bros"}]'
  exit 0
fi
if [[ "\$1" == "tunnel" && "\$2" == "route" ]]; then
  echo "INF bros.example.com is already configured to route to your tunnel"
  echo ROUTED >> "${root}/cf.route"
  exit 0
fi
if [[ "\$*" == *run* || "\$*" == *--config* ]]; then
  echo RAN >> "${root}/cf.run"
  sleep 30
fi
exit 0
`)
    chmodSync(fake, 0o755)
    mkdirSync(join(root, '.cloudflared'), { recursive: true })
    writeFileSync(join(root, '.cloudflared', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.json'), '{}')
    writeFileSync(join(root, '.cloudflared', 'cert.pem'), 'x')
    bash(
      `set -euo pipefail
       source "${HELPER_SH}"
       start_cf || true`,
      {
        BROS_TUNNEL_DIR: tunnelDir,
        BROS_PORT: '3055',
        HOME: root,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    )
    expect(existsSync(join(root, 'cf.run'))).toBe(true)
    expect(existsSync(join(root, 'cf.route'))).toBe(true)
    expect(readFileSync(join(root, 'cf.args'), 'utf8')).toMatch(/tunnel route dns bros bros\.example\.com/)
  })

  it('maybe_autostart retries a stale REST route error', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-route-retry-'))
    const tunnelDir = join(root, 'tunnel')
    const binDir = join(root, 'bin')
    mkdirSync(tunnelDir, { recursive: true })
    mkdirSync(binDir, { recursive: true })
    writeFileSync(join(tunnelDir, 'public_url'), 'https://bros.jasenmichael.com\n')
    writeFileSync(join(tunnelDir, 'enabled'), '1\n')
    writeFileSync(
      join(tunnelDir, 'error'),
      'Failed to route bros.jasenmichael.com to named tunnel: REST request failed: Put "https://api.cloudflare.com/client/v4/zones/a2ceecc34b908eeabe5bd2b4c5dcb068/tunnels/b880bc39-b98f-41e2-a776-fc581b353768/routes": http2: timeout awaiting response headers\n',
    )
    const fake = join(binDir, 'cloudflared')
    writeFileSync(fake, `#!/usr/bin/env bash
if [[ "\$1" == "tunnel" && "\$2" == "list" ]]; then
  printf '%s\\n' '[{"id":"b880bc39-b98f-41e2-a776-fc581b353768","name":"bros"}]'
  exit 0
fi
if [[ "\$1" == "tunnel" && "\$2" == "route" ]]; then
  echo 'ERR REST request failed: Put "https://api.cloudflare.com/client/v4/zones/abc/tunnels/b880bc39-b98f-41e2-a776-fc581b353768/routes": http2: timeout awaiting response headers'
  exit 1
fi
if [[ "\$*" == *run* || "\$*" == *--config* ]]; then
  echo RAN >> "${root}/cf.run"
  sleep 30
fi
exit 0
`)
    chmodSync(fake, 0o755)
    mkdirSync(join(root, '.cloudflared'), { recursive: true })
    writeFileSync(join(root, '.cloudflared', 'b880bc39-b98f-41e2-a776-fc581b353768.json'), '{}')
    writeFileSync(join(root, '.cloudflared', 'cert.pem'), 'x')
    bash(
      `set -euo pipefail
       source "${HELPER_SH}"
       maybe_autostart`,
      {
        BROS_TUNNEL_DIR: tunnelDir,
        BROS_PORT: '3055',
        HOME: root,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    )
    expect(existsSync(join(root, 'cf.run'))).toBe(true)
    expect(readFileSync(join(tunnelDir, 'error'), 'utf8')).toMatch(/cloudflared tunnel route dns timed out/)
    expect(readFileSync(join(tunnelDir, 'error'), 'utf8')).not.toMatch(/^Failed to route /)
  })

  it('write_status clears quick hostname when cloudflared is stopped', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-status-off-'))
    const tunnelDir = join(root, 'tunnel')
    mkdirSync(tunnelDir, { recursive: true })
    writeFileSync(join(tunnelDir, 'hostname'), 'old-quick.trycloudflare.com\n')
    writeFileSync(join(tunnelDir, 'logs.txt'), 'https://old-quick.trycloudflare.com\n')
    bash(
      `set -euo pipefail
       source "${HELPER_SH}"
       write_status`,
      { BROS_TUNNEL_DIR: tunnelDir, BROS_PORT: '3055', HOME: root, PATH: '/usr/bin:/bin' },
    )
    const parsed = JSON.parse(readFileSync(join(tunnelDir, 'status.json'), 'utf8')) as {
      running: boolean
      hostname: string | null
    }
    expect(parsed.running).toBe(false)
    expect(parsed.hostname).toBeNull()
    expect(existsSync(join(tunnelDir, 'hostname'))).toBe(false)
  })

  it('write_status keeps a route dns warning while the pid is alive', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-status-dns-'))
    const tunnelDir = join(root, 'tunnel')
    mkdirSync(tunnelDir, { recursive: true })
    writeFileSync(
      join(tunnelDir, 'error'),
      'cloudflared tunnel route dns timed out. Named tunnel will still run. Confirm CNAME bros.example.com → id.cfargotunnel.com, or retry: cloudflared tunnel route dns id bros.example.com\n',
    )
    writeFileSync(join(tunnelDir, 'logs.txt'), 'INF Registered tunnel connection protocol=http2\n')
    const out = bash(
      `set -euo pipefail
       source "${HELPER_SH}"
       echo $$ > "${tunnelDir}/cloudflared.pid"
       write_status
       cat "${tunnelDir}/status.json"`,
      { BROS_TUNNEL_DIR: tunnelDir, BROS_PORT: '3055', HOME: root, PATH: '/usr/bin:/bin' },
    )
    const parsed = JSON.parse(out.slice(out.indexOf('{'))) as { running: boolean; error: string | null }
    expect(parsed.running).toBe(true)
    expect(parsed.error).toMatch(/cloudflared tunnel route dns timed out/)
  })
})
