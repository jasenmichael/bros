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

  it('keeps sidecar pack mounts in prod compose only', () => {
    const base = readFileSync(join(REPO, 'docker-compose.yml'), 'utf8')
    const dev = readFileSync(join(REPO, 'docker-compose.dev.yml'), 'utf8')
    const prod = readFileSync(join(REPO, 'docker-compose.prod.yml'), 'utf8')
    const mounts = [
      './lib/sidecars/core:/app/sidecars/core:ro',
      './lib/sidecars/addon:/app/sidecars/addon:ro',
      '${BROS_SIDECARS_DIR:-./sidecars}:/app/sidecars/custom',
    ]
    for (const line of mounts) {
      expect(base).not.toContain(line)
      expect(dev).not.toContain(line)
      expect(prod).toContain(line)
    }
    expect(base).toContain('BROS_SIDECARS_DIR: /app/sidecars/custom')
    expect(dev).toContain('BROS_SIDECARS_DIR: /app/sidecars')
    expect(dev).not.toContain('BROS_SIDECARS_DISABLE')
    expect(dev).not.toContain('extra_hosts')
    expect(dev).not.toContain('/var/run/docker.sock')
  })

  it('merges the base file with one overlay', () => {
    const fn = extractFn(readFileSync(BROS, 'utf8'), 'compose_files')
    const prod = bash(`${fn}\nDEV=0\ncompose_files`).trim()
    const dev = bash(`${fn}\nDEV=1\ncompose_files`).trim()
    expect(prod).toBe('-f docker-compose.yml -f docker-compose.prod.yml')
    expect(dev).toBe('-f docker-compose.yml -f docker-compose.dev.yml')
  })

  it('keeps listen env on BROS_PORT and BROS_HOST', () => {
    const files = ['docker-compose.yml', 'docker-compose.dev.yml', 'docker-compose.prod.yml']
    const banned = ['PORT', 'NUXT_PORT', 'NITRO_PORT', 'HOST', 'NUXT_HOST', 'NITRO_HOST']
    for (const file of files) {
      const yml = readFileSync(join(REPO, file), 'utf8')
      for (const key of banned) {
        expect(yml).not.toMatch(new RegExp(`^\\s+${key}:`, 'm'))
      }
    }
    const base = readFileSync(join(REPO, 'docker-compose.yml'), 'utf8')
    expect(base).toContain('BROS_PORT: ${BROS_PORT:-3055}')
    expect(base).toContain('BROS_HOST: ${BROS_HOST:-127.0.0.1}')
    expect(base).toContain('"${BROS_PORT:-3055}:${BROS_PORT:-3055}"')
  })

  it('load_listen_env uses command env, then .env, then defaults', () => {
    const src = readFileSync(BROS, 'utf8')
    const fns = `${extractFn(src, 'dotenv_key')}\n${extractFn(src, 'load_listen_env')}`
    const dir = mkdtempSync(join(tmpdir(), 'bros-listen-'))
    try {
      writeFileSync(join(dir, '.env'), 'BROS_PORT=4000\nBROS_HOST=10.0.0.2\n')
      const fromFile = bash(
        `set -euo pipefail
         REPO_ROOT=${dir}
         unset BROS_PORT BROS_HOST
         ${fns}
         load_listen_env
         printf '%s %s' "$BROS_PORT" "$BROS_HOST"`,
      ).trim()
      expect(fromFile).toBe('4000 10.0.0.2')
      const fromEnv = bash(
        `set -euo pipefail
         REPO_ROOT=${dir}
         BROS_PORT=4001
         unset BROS_HOST
         ${fns}
         load_listen_env
         printf '%s %s' "$BROS_PORT" "$BROS_HOST"`,
      ).trim()
      expect(fromEnv).toBe('4001 10.0.0.2')
      writeFileSync(join(dir, '.env'), '# empty\n')
      const defaults = bash(
        `set -euo pipefail
         REPO_ROOT=${dir}
         unset BROS_PORT BROS_HOST
         ${fns}
         load_listen_env
         printf '%s %s' "$BROS_PORT" "$BROS_HOST"`,
      ).trim()
      expect(defaults).toBe('3055 127.0.0.1')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
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
    expect(err).toContain('--dev removed. Use: BROS_DEV=1 ./bros')
  })

  it('help has no --dev flag and mentions BROS_DEV=1 ./bros', () => {
    const out = execFileSync(BROS, ['--help'], { encoding: 'utf8' })
    expect(out).not.toMatch(/^\s+--dev\b/m)
    expect(out).toContain('BROS_DEV=1 ./bros')
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

  it('resolve_default_config uses $BROS_DIR/bros.yml', () => {
    const fn = extractFn(src, 'resolve_default_config')
    const dir = mkdtempSync(join(tmpdir(), 'bros-cfg-'))
    writeFileSync(join(dir, 'bros.yml'), 'public_url: "https://bros.example"\n')
    const out = bash(
      `set -euo pipefail
       CONFIG_PATH=''
       BROS_DIR='${dir}'
       BROS_HOME='${dir}'
       ${fn}
       resolve_default_config`,
    ).trim()
    rmSync(dir, { recursive: true, force: true })
    expect(out).toBe(join(dir, 'bros.yml'))
  })

  it('resolve_bros_dir defaults to the script directory (symlink-aware)', () => {
    const resolveScript = extractFn(src, 'resolve_script_dir')
    const fn = extractFn(src, 'resolve_bros_dir')
    const dir = mkdtempSync(join(tmpdir(), 'bros-dir-'))
    const real = join(dir, 'real')
    const bin = join(dir, 'bin')
    mkdirSync(real, { recursive: true })
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(real, 'bros'), '#!/bin/sh\n')
    symlinkSync(join(real, 'bros'), join(bin, 'bros'))
    const out = bash(
      `set -euo pipefail
       ${resolveScript}
       ${fn}
       SCRIPT_DIR="$(resolve_script_dir '${join(bin, 'bros')}')"
       unset BROS_DIR BROS_HOME BROS_HOST_DATA_DIR BROS_BIN
       HOME='${dir}'
       resolve_bros_dir
       printf '%s\\n' "$BROS_DIR"
       printf '%s\\n' "$BROS_HOME"`,
    ).trim()
    rmSync(dir, { recursive: true, force: true })
    const [brosDir, brosHome] = out.split('\n')
    expect(brosDir).toBe(real)
    expect(brosHome).toBe(real)
  })

  it('resolve_bros_dir keeps explicit BROS_DIR and aliases BROS_HOME alone', () => {
    const fn = extractFn(src, 'resolve_bros_dir')
    const out = bash(
      `set -euo pipefail
       SCRIPT_DIR='/tmp/script-should-not-win'
       ${fn}
       unset BROS_DIR BROS_HOME BROS_HOST_DATA_DIR BROS_BIN
       BROS_DIR='/explicit/dir'
       resolve_bros_dir
       printf '%s\\n' "$BROS_DIR"
       printf '%s\\n' "$BROS_HOME"
       unset BROS_DIR BROS_HOME BROS_HOST_DATA_DIR BROS_BIN
       BROS_HOME='/alias/home'
       resolve_bros_dir
       printf '%s\\n' "$BROS_DIR"
       printf '%s\\n' "$BROS_HOME"`,
    ).trim()
    expect(out).toBe([
      '/explicit/dir',
      '/explicit/dir',
      '/alias/home',
      '/alias/home',
    ].join('\n'))
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

describe('workspace package scripts', () => {
  it('app:dev runs the app filter from src/', () => {
    const pkg = JSON.parse(readFileSync(join(REPO, 'src/package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts.dev).toBeUndefined()
    expect(pkg.scripts['dev:update']).toBeUndefined()
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
