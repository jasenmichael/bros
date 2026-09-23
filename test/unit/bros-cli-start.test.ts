import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(import.meta.dirname, '../..')
const BROS = join(REPO, 'bros')

function extractFn(src: string, name: string) {
  const m = src.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'))
  if (!m) throw new Error(`missing ${name}()`)
  return m[0]
}

function bash(script: string) {
  return execFileSync('bash', ['-c', script], { encoding: 'utf8' })
}

function runComposeUp(dev: 0 | 1, extra = '-d') {
  const fn = extractFn(readFileSync(BROS, 'utf8'), 'compose_up')
  return bash(
    `set -euo pipefail
     DEV=${dev}
     compose() { printf 'compose %s\\n' "$*"; }
     ${fn}
     compose_up ${extra}`,
  ).trim()
}

describe('bros CLI start build policy', () => {
  it('dev compose_up omits --build', () => {
    expect(runComposeUp(1)).toBe('compose up -d')
  })

  it('prod compose_up keeps --build', () => {
    expect(runComposeUp(0)).toBe('compose up --build -d')
  })

  it('cmd_start uses compose_up', () => {
    const start = extractFn(readFileSync(BROS, 'utf8'), 'cmd_start')
    expect(start).toMatch(/compose_up /)
    expect(start).not.toMatch(/compose up --build/)
    expect(start).toMatch(/ensure_ollama_and_model/)
  })

  it('cmd_start ensures shared network before compose_up', () => {
    const start = extractFn(readFileSync(BROS, 'utf8'), 'cmd_start')
    expect(start).toMatch(/ensure_bros_network/)
    expect(start.indexOf('ensure_bros_network')).toBeLessThan(start.indexOf('compose_up'))
  })

  it('ensure_bros_network creates a missing bridge network', () => {
    const fn = extractFn(readFileSync(BROS, 'utf8'), 'ensure_bros_network')
    const out = bash(
      `set -euo pipefail
       calls="$(mktemp)"
       docker() {
         printf '%s\\n' "$*" >> "$calls"
         if [[ "$1" == network && "$2" == inspect ]]; then return 1; fi
         if [[ "$1" == network && "$2" == create ]]; then return 0; fi
         return 1
       }
       ${fn}
       ensure_bros_network
       cat "$calls"
       rm -f "$calls"`,
    ).trim()
    expect(out).toBe('network inspect bros\nnetwork create --driver bridge bros')
  })

  it('ensure_bros_network is a no-op when the network exists', () => {
    const fn = extractFn(readFileSync(BROS, 'utf8'), 'ensure_bros_network')
    const out = bash(
      `set -euo pipefail
       docker() {
         if [[ "$1" == network && "$2" == inspect ]]; then return 0; fi
         echo "unexpected: $*" >&2
         return 1
       }
       ${fn}
       ensure_bros_network
       echo ok`,
    ).trim()
    expect(out).toBe('ok')
  })

  it('core compose treats bros as external', () => {
    const yml = readFileSync(join(REPO, 'docker-compose.yml'), 'utf8')
    expect(yml).toMatch(/networks:\s*\n\s+bros:\s*\n\s+name: bros\s*\n\s+external: true\s*$/m)
  })

  it('does not copy named Docker volumes on start', () => {
    const src = readFileSync(BROS, 'utf8')
    expect(src).not.toContain('try_copy_volumes')
    expect(src).not.toContain('Copying Docker volume')
    expect(src).not.toMatch(/^volume_exists\(\)/m)
    expect(src).not.toMatch(/^dir_is_empty\(\)/m)
    const ensure = extractFn(src, 'ensure_host_data_dir')
    expect(ensure).toContain('mkdir -p')
    expect(ensure).not.toContain('docker volume')
    expect(ensure).not.toContain('alpine:3.20')
  })

  it('update pulls, rebuilds, and git-pulls', () => {
    const update = extractFn(readFileSync(BROS, 'utf8'), 'cmd_update')
    expect(update).toContain('compose pull')
    expect(update).toContain('compose build --pull')
    expect(update).toContain('pull --ff-only')
    expect(update).toContain('submodule update --init')
  })
})

describe('bros CLI flags and help', () => {
  it('rejects --dev', () => {
    let err = ''
    try {
      execFileSync(BROS, ['--dev'], { encoding: 'utf8' })
    }
    catch (e) {
      const ex = e as { stderr?: string, stdout?: string }
      err = `${ex.stderr || ''}${ex.stdout || ''}`
    }
    expect(err).toContain('--dev removed. Use: pnpm dev')
  })

  it('help has no --dev flag and mentions pnpm dev', () => {
    const out = execFileSync(BROS, ['--help'], { encoding: 'utf8' })
    expect(out).not.toMatch(/^\s+--dev\b/m)
    expect(out).toContain('pnpm dev')
    expect(out).toContain('service install')
    expect(out).toContain('BROS_HOME')
  })
})

describe('bros path helpers', () => {
  const src = readFileSync(BROS, 'utf8')

  it('resolve_script_dir follows a symlink to the checkout', () => {
    const fn = extractFn(src, 'resolve_script_dir')
    const dir = mkdtempSync(join(tmpdir(), 'bros-link-'))
    const target = join(dir, 'real', 'bros')
    const link = join(dir, 'bin', 'bros')
    mkdirSync(join(dir, 'real'), { recursive: true })
    mkdirSync(join(dir, 'bin'), { recursive: true })
    writeFileSync(target, '#!/bin/sh\n')
    symlinkSync(target, link)
    const out = bash(
      `set -euo pipefail
       ${fn}
       resolve_script_dir '${link}'`,
    ).trim()
    rmSync(dir, { recursive: true, force: true })
    expect(out).toBe(join(dir, 'real'))
  })

  it('resolve_default_config prefers ~/.config/bros.yml', () => {
    const xdg = extractFn(src, 'xdg_config_path')
    const fn = extractFn(src, 'resolve_default_config')
    const dir = mkdtempSync(join(tmpdir(), 'bros-cfg-'))
    const home = join(dir, 'home')
    mkdirSync(join(home, '.config'), { recursive: true })
    writeFileSync(join(home, '.config', 'bros.yml'), 'public_url: ""\n')
    writeFileSync(join(dir, 'bros.yml'), 'public_url: "https://ignored.example"\n')
    const out = bash(
      `set -euo pipefail
       HOME='${home}'
       unset BROS_CONFIG XDG_CONFIG_HOME
       BROS_HOME='${dir}'
       ${xdg}
       ${fn}
       resolve_default_config`,
    ).trim()
    rmSync(dir, { recursive: true, force: true })
    expect(out).toBe(join(home, '.config', 'bros.yml'))
  })
})

describe('internal model stamp skip', () => {
  it('stamp_is_current is true when dest stamp matches vendor GGUF', () => {
    const src = readFileSync(BROS, 'utf8')
    const vendorStamp = extractFn(src, 'vendor_stamp_json')
    const stampIsCurrent = extractFn(src, 'stamp_is_current')
    const dir = mkdtempSync(join(tmpdir(), 'bros-stamp-'))
    const vendor = join(dir, 'vendor', 'bros-model', 'models')
    mkdirSync(vendor, { recursive: true })
    mkdirSync(join(dir, 'data', 'ollama', 'bros-model'), { recursive: true })
    const gguf = join(vendor, 'bros-q4_k_m.gguf')
    writeFileSync(gguf, 'gguf-bytes')
    const identity = bash(
      `set -euo pipefail
       ${vendorStamp}
       vendor_stamp_json '${gguf}'`,
    ).trim()
    writeFileSync(join(dir, 'data', 'ollama', 'bros-model', '.bros-gguf-stamp.json'), `${identity}\n`)
    const out = bash(
      `set -euo pipefail
       VENDOR_MODEL_DIR='${join(dir, 'vendor', 'bros-model')}'
       GGUF_REL='models/bros-q4_k_m.gguf'
       STAMP_NAME='.bros-gguf-stamp.json'
       BROS_HOST_DATA_DIR='${join(dir, 'data')}'
       ${extractFn(src, 'gguf_path')}
       ${extractFn(src, 'stamp_path')}
       ${vendorStamp}
       ${stampIsCurrent}
       if stamp_is_current; then echo current; else echo stale; fi`,
    ).trim()
    rmSync(dir, { recursive: true, force: true })
    expect(out).toBe('current')
  })
})

describe('root package scripts', () => {
  it('pnpm dev is BROS_DEV=1 ./bros', () => {
    const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts.dev).toMatch(/^BROS_DEV=1 \.\/bros\b/)
    expect(pkg.scripts['dev:update']).toBe('BROS_DEV=1 ./bros update')
    expect(pkg.scripts['app:dev']).toBe('pnpm --filter @bros/app dev')
  })
})

describe('install.sh next steps', () => {
  it('does not mention --dev', () => {
    const sh = readFileSync(join(REPO, 'src/website/public/install.sh'), 'utf8')
    expect(sh).not.toContain('--dev')
    expect(sh).toContain('BROS_HOME')
    expect(sh).toContain('BROS_BIN')
    expect(sh).toContain('--service')
  })
})
