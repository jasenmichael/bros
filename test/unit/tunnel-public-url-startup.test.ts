import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const REPO = join(import.meta.dirname, '../..')
const TUNNEL_SH = join(REPO, 'scripts/bros-tunnel.sh')
const HELPER_SH = join(REPO, 'scripts/bros-tunnel-helper.sh')

function bash(script: string, env: NodeJS.ProcessEnv = {}) {
  return execFileSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

describe('public_url tunnel startup', () => {
  let root = ''

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('set public_url → start attempted (enabled + advertised host)', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-puburl-set-'))
    writeFileSync(join(root, 'bros.yml'), 'working_dir: .\ndata_dir: ./data\npublic_url: "https://bros.example.com"\n')
    const out = bash(
      `set -euo pipefail
       source "${TUNNEL_SH}"
       if bros_tunnel_apply_public_url; then echo WANT_START; else echo NO_START; fi
       cat "$(bros_tunnel_dir)/enabled"
       cat "$(bros_tunnel_dir)/public_url"
       cat "$(bros_tunnel_dir)/hostname"`,
      { BROS_DIR: root, BROS_HOST_DATA_DIR: join(root, 'data'), BROS_PUBLIC_URL: '' },
    )
    expect(out).toContain('WANT_START')
    expect(out).toContain('https://bros.example.com')
    expect(out).toContain('bros.example.com')
    expect(readFileSync(join(root, 'data/tunnel/enabled'), 'utf8').trim()).toBe('1')
  })

  it('unset public_url → no auto-start from config', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-puburl-unset-'))
    writeFileSync(join(root, 'bros.yml'), 'working_dir: .\ndata_dir: ./data\n')
    const out = bash(
      `set -euo pipefail
       source "${TUNNEL_SH}"
       if bros_tunnel_apply_public_url; then echo WANT_START; else echo NO_START; fi
       if [[ -f "$(bros_tunnel_dir)/enabled" ]]; then cat "$(bros_tunnel_dir)/enabled"; else echo NO_ENABLED; fi
       if [[ -f "$(bros_tunnel_dir)/command" ]]; then echo HAS_COMMAND; else echo NO_COMMAND; fi`,
      { BROS_DIR: root, BROS_HOST_DATA_DIR: join(root, 'data'), BROS_PUBLIC_URL: '' },
    )
    expect(out).toContain('NO_START')
    expect(out).toContain('NO_ENABLED')
    expect(out).toContain('NO_COMMAND')
    expect(existsSync(join(root, 'data/tunnel/command'))).toBe(false)
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
})
