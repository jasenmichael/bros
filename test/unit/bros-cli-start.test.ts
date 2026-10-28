import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createError } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { dockerCommandError, shouldRunAutostart } from '../../src/server/utils/docker'

const REPO = join(import.meta.dirname, '../..')
const BROS = join(REPO, 'bros')

function extractFn(src: string, name: string) {
  const m = src.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'))
  if (!m) throw new Error(`missing ${name}()`)
  return m[0]
}

function logFns(src: string, names: string[]) {
  return names.map((name) => extractFn(src, name)).join('\n')
}

function bash(script: string) {
  return execFileSync('bash', ['-c', script], { encoding: 'utf8' })
}

function bashPty(script: string) {
  const py = `
import os, pty, sys
script = sys.stdin.buffer.read()
pid, fd = pty.fork()
if pid == 0:
    os.execvp('bash', ['bash', '--noprofile', '--norc', '-c', script.decode()])
data = bytearray()
while True:
    try:
        chunk = os.read(fd, 65536)
    except OSError:
        break
    if not chunk:
        break
    data += chunk
_, status = os.waitpid(pid, 0)
sys.stdout.buffer.write(data)
code = os.waitstatus_to_exitcode(status)
if code:
    sys.exit(code)
`
  return execFileSync('python3', ['-c', py], { encoding: 'utf8', input: script })
}

function visibleLines(raw: string) {
  const stripped = raw
    .replace(/\x1b\[[?0-9;]*[A-Za-z]/g, '')
    .replace(/\r\n/g, '\n')
  const lines = stripped.split('\n').map((line) => {
    const parts = line.split('\r')
    return parts[parts.length - 1] ?? ''
  })
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function runComposeUp(dev: 0 | 1, extra = '-d', verbose = 0) {
  const fn = extractFn(readFileSync(BROS, 'utf8'), 'compose_up')
  return bash(
    `set -euo pipefail
     DEV=${dev}
     VERBOSE=${verbose}
     compose() { printf 'compose %s\\n' "$*"; }
     ${fn}
     compose_up ${extra}`,
  ).trim()
}

describe('bros CLI start build policy', () => {
  it('dev compose_up omits --build and hides docker chrome', () => {
    expect(runComposeUp(1)).toBe('compose up --no-log-prefix -d')
  })

  it('prod compose_up keeps --build and hides docker chrome', () => {
    expect(runComposeUp(0)).toBe('compose up --build --no-log-prefix -d')
  })

  it('puts --progress on docker compose, not on up', () => {
    const src = readFileSync(BROS, 'utf8')
    const fns = `${extractFn(src, 'compose_files')}\n${extractFn(src, 'compose')}\n${extractFn(src, 'compose_up')}`
    const quiet = bash(
      `set -euo pipefail
       DEV=1
       VERBOSE=0
       docker() { printf 'docker %s\\n' "$*"; }
       ${fns}
       compose_up -d`,
    ).trim()
    const verbose = bash(
      `set -euo pipefail
       DEV=1
       VERBOSE=1
       docker() { printf 'docker %s\\n' "$*"; }
       ${fns}
       compose_up -d`,
    ).trim()
    expect(quiet).toBe('docker compose --progress plain -f docker-compose.yml -f docker-compose.dev.yml up --no-log-prefix -d')
    expect(verbose).toBe('docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d')
  })

  it('verbose compose_up shows docker chrome', () => {
    expect(runComposeUp(1, '-d', 1)).toBe('compose up -d')
    expect(runComposeUp(0, '-d', 1)).toBe('compose up --build -d')
  })

  it('quiet compose progress is only for the stop one-off', () => {
    const src = readFileSync(BROS, 'utf8')
    const fns = `${extractFn(src, 'compose_files')}\n${extractFn(src, 'compose')}`
    const quiet = bash(
      `set -euo pipefail
       DEV=1
       VERBOSE=0
       COMPOSE_PROGRESS_QUIET=1
       docker() { printf 'docker %s\\n' "$*"; }
       ${fns}
       compose run --rm bros stop`,
    ).trim()
    expect(quiet).toBe('docker compose --progress quiet -f docker-compose.yml -f docker-compose.dev.yml run --rm bros stop')
  })

  it('listen url uses host and port, and 0.0.0.0 is local', () => {
    const src = readFileSync(BROS, 'utf8')
    const fns = `${extractFn(src, 'ui_listen_host')}\n${extractFn(src, 'ui_listen_url')}`
    const out = bash(
      `set -euo pipefail
       ${fns}
       BROS_HOST=10.0.0.2 BROS_PORT=4000
       printf '%s ' "$(ui_listen_url)"
       BROS_HOST=0.0.0.0 BROS_PORT=3055
       printf '%s' "$(ui_listen_url)"`,
    ).trim()
    expect(out).toBe('http://10.0.0.2:4000 http://127.0.0.1:3055')
  })

  it('prints host LAN urls and skips docker bridges', () => {
    const src = readFileSync(BROS, 'utf8')
    const fn = extractFn(src, 'ui_lan_urls')
    const out = bash(
      `set -euo pipefail
       ${fn}
       ip() { printf '%s\\n' '2: wlp0s20f3 inet 10.14.72.140/24 scope global' '3: docker0 inet 172.17.0.1/16 scope global' '4: br-abc inet 172.24.0.1/16 scope global'; }
       BROS_HOST=0.0.0.0 BROS_PORT=3055
       ui_lan_urls
       BROS_HOST=10.0.0.2
       ui_lan_urls`,
    ).trim()
    expect(out).toBe('http://10.14.72.140:3055')
  })

  it('cmd_start uses compose_up', () => {
    const start = extractFn(readFileSync(BROS, 'utf8'), 'cmd_start')
    expect(start).toMatch(/compose_up /)
    expect(start).not.toMatch(/compose up --build/)
    expect(start).toMatch(/exec_node start/)
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
    expect(yml).toMatch(/bros-x11:\s*\n\s+name: bros-x11\s*\n\s+external: true\s*$/m)
  })

  it('keeps sidecar pack mounts in prod compose only', () => {
    const base = readFileSync(join(REPO, 'docker-compose.yml'), 'utf8')
    const dev = readFileSync(join(REPO, 'docker-compose.dev.yml'), 'utf8')
    const prod = readFileSync(join(REPO, 'docker-compose.prod.yml'), 'utf8')
    const mounts = [
      './lib/sidecars/core:/app/sidecars/core:ro',
      './lib/sidecars/addon:/app/sidecars/addon:ro',
      './lib/sidecars/custom:/app/sidecars/custom',
    ]
    for (const line of mounts) {
      expect(base).not.toContain(line)
      expect(dev).not.toContain(line)
      expect(prod).toContain(line)
    }
    expect(base).not.toContain('BROS_SIDECARS_DIR')
    expect(dev).not.toContain('BROS_SIDECARS_DIR')
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
    expect(base).toContain('BROS_HOST: ${BROS_HOST:-0.0.0.0}')
    expect(base).toContain('BROS_DEV: ${BROS_DEV:-}')
    expect(base).toContain('BROS_PUBLIC_URL: ${BROS_PUBLIC_URL:-}')
    expect(base).toContain('BROS_CONFIG_HOST: ${BROS_CONFIG_HOST:-}')
    expect(base).toContain('BROS_TUNNEL_HOST: ${BROS_TUNNEL_HOST:-}')
    expect(base).toContain('BROS_SIDECAR_FIRECRAWL_UI: ${BROS_SIDECAR_FIRECRAWL_UI:-}')
    expect(base).toContain('"${BROS_PORT:-3055}:${BROS_PORT:-3055}"')
  })

  it('load_dotenv exports .env, then listen defaults, shell wins', () => {
    const src = readFileSync(BROS, 'utf8')
    const fns = `${extractFn(src, 'load_dotenv')}\n${extractFn(src, 'load_listen_env')}`
    const dir = mkdtempSync(join(tmpdir(), 'bros-listen-'))
    try {
      writeFileSync(join(dir, '.env'), 'BROS_PORT=4000\nBROS_HOST=10.0.0.2\nBROS_TUNNEL_HOST=bros.example.com\nBROS_OLLAMA_PORT=11499\n')
      const fromFile = bash(
        `set -euo pipefail
         REPO_ROOT=${dir}
         unset BROS_PORT BROS_HOST BROS_TUNNEL_HOST BROS_OLLAMA_PORT
         ${fns}
         load_dotenv
         load_listen_env
         printf '%s %s %s %s' "$BROS_PORT" "$BROS_HOST" "$BROS_TUNNEL_HOST" "$BROS_OLLAMA_PORT"`,
      ).trim()
      expect(fromFile).toBe('4000 10.0.0.2 bros.example.com 11499')
      const fromEnv = bash(
        `set -euo pipefail
         REPO_ROOT=${dir}
         BROS_PORT=4001
         unset BROS_HOST BROS_TUNNEL_HOST
         ${fns}
         load_dotenv
         load_listen_env
         printf '%s %s' "$BROS_PORT" "$BROS_HOST"`,
      ).trim()
      expect(fromEnv).toBe('4001 10.0.0.2')
      writeFileSync(join(dir, '.env'), '# empty\n')
      const defaults = bash(
        `set -euo pipefail
         REPO_ROOT=${dir}
         unset BROS_PORT BROS_HOST BROS_TUNNEL_HOST
         ${fns}
         load_dotenv
         load_listen_env
         printf '%s %s %s' "$BROS_PORT" "$BROS_HOST" "\${BROS_TUNNEL_HOST-unset}"`,
      ).trim()
      expect(defaults).toBe('3055 0.0.0.0 unset')
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
    expect(ensure).not.toContain('migrate_sidecar_data')
    expect(src).not.toContain('migrate_sidecar_data')
    expect(src).not.toContain('move_if_missing')
    expect(src).not.toContain('nest_volume')
    expect(src).not.toContain('ollama-config')
  })

  it('update pulls, rebuilds, and git-pulls', () => {
    const update = readFileSync(join(REPO, 'src/cli/index.ts'), 'utf8')
    expect(update).toContain("composeArgs(['build'])")
    expect(update).not.toContain('--pull')
    expect(update).toContain("'submodule', 'update', '--init'")
    expect(update).toContain('ensureHostWorkspace()')
    expect(readFileSync(BROS, 'utf8')).toContain('git -C "$REPO_ROOT" pull --ff-only')
  })

  it('defaults BROS_HOST_WORKSPACE to the host data workspace', () => {
    const fn = extractFn(readFileSync(BROS, 'utf8'), 'resolve_bros_dir')
    const set = bash(`
      set -euo pipefail
      ${fn}
      unset BROS_HOST_WORKSPACE
      BROS_DIR=/repo
      BROS_HOME=/repo
      BROS_HOST_DATA_DIR=/host/data
      resolve_bros_dir
      printf '%s' "$BROS_HOST_WORKSPACE"
    `).trim()
    expect(set).toBe('/host/data/home/workspace')
    const keep = bash(`
      set -euo pipefail
      ${fn}
      BROS_HOST_WORKSPACE=/keep
      BROS_DIR=/repo
      BROS_HOME=/repo
      BROS_HOST_DATA_DIR=/host/data
      resolve_bros_dir
      printf '%s' "$BROS_HOST_WORKSPACE"
    `).trim()
    expect(keep).toBe('/keep')
    const skip = bash(`
      set -euo pipefail
      ${fn}
      unset BROS_HOST_WORKSPACE
      BROS_DIR=/repo
      BROS_HOME=/repo
      BROS_HOST_DATA_DIR=/app/data
      resolve_bros_dir
      printf '%s' "\${BROS_HOST_WORKSPACE-unset}"
    `).trim()
    expect(skip).toBe('unset')
  })
})

describe('bros stop output', () => {
  const src = readFileSync(BROS, 'utf8')

  function filterStop(input: string, env = '') {
    const fn = logFns(src, ['split_records', 'strip_ansi_line', 'suppress_build_summary', 'filter_lines'])
    return bash(`set -euo pipefail
${env}
${fn}
filter_lines <<'EOF'
${input}
EOF`).replace(/\n$/, '')
  }

  it('drops timestamps, empty-project warnings, info, and the one-off container', () => {
    const input = [
      ' Container bros-bros-run-3d61c1ada05c Creating ',
      ' Container bros-bros-run-3d61c1ada05c Created ',
      'info Stopping sidecars (bros-sc-*)…',
      'time="2026-10-15T03:25:34Z" level=warning msg="Warning: No resource found to remove for project \\"bros-sc-cli\\"."',
      'time="2026-10-15T03:25:34Z" level=warning msg="Warning: No resource found to remove for project \\"bros-sc-ollama\\"."',
      'info Stopping Bros core…',
      'time="2026-10-15T03:25:35Z" level=warning msg="Warning: No resource found to remove for project \\"bros\\"."',
      'WARN[0000] Warning: No resource found to remove for project "bros". ',
    ].join('\n')
    expect(filterStop(input)).toBe([
      'Stopping sidecars (bros-sc-*)…',
      'Stopping Bros core…',
    ].join('\n'))
  })

  it('keeps daemon, permission, and container stop failures', () => {
    const input = [
      'permission denied while trying to connect to the Docker daemon socket',
      'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
      'time="2026-10-15T03:25:36Z" level=error msg="Cannot stop container bros-apps"',
      'time="2026-10-15T03:25:36Z" level=warning msg="The \\"BROS_PORT\\" variable is not set. Defaulting to a blank string."',
      'ERRO[0000] Error response from daemon: cannot stop container bros-apps',
      ' Container bros-apps Stopping ',
      ' Container bros-apps Error ',
    ].join('\n')
    expect(filterStop(input)).toBe([
      'permission denied while trying to connect to the Docker daemon socket',
      'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
      'Cannot stop container bros-apps',
      'The "BROS_PORT" variable is not set. Defaulting to a blank string.',
      'Error response from daemon: cannot stop container bros-apps',
      'Container bros-apps Stopping',
      'Container bros-apps Error',
    ].join('\n'))
  })

  it('stops containers by name and does not compose down', () => {
    const stop = extractFn(src, 'stop_full_stack')
    const containers = extractFn(src, 'stop_containers')
    expect(stop).toContain('stop_containers')
    expect(stop).not.toContain('run_node stop')
    expect(stop).not.toContain('compose down')
    expect(containers).toContain('stop_matching \'bros-sc-\'')
    expect(containers).toContain('stop_matching \'bros-desktop\'')
    expect(containers).toContain('stop_matching \'bros\'')
    expect(extractFn(src, 'stop_matching')).toContain('docker stop -t 10')
    expect(extractFn(src, 'stop_matching')).toContain('docker rm -f')
    expect(stop).toContain('Bros exited.')
    const cli = readFileSync(join(REPO, 'src/cli/index.ts'), 'utf8')
    const body = cli.slice(cli.indexOf('async function rmMatching'), cli.indexOf('async function ensureNetwork'))
    expect(body).toContain("console.log('Stopping sidecars (bros-sc-*)…')")
    expect(body).toContain("console.log('Stopping Bros core…')")
    expect(body).toContain("'stop', '-t', '10'")
    expect(body).toContain("'rm', '-f'")
    expect(body).not.toContain("'compose'")
    expect(body).not.toContain('compose down')
    expect(body).not.toContain('consola.info')
  })

  it('drops a build step on the stop filter instead of printing Building image…', () => {
    const input = [
      '#27 [build 7/7] RUN pnpm --filter @bros/ui build',
      '#27 12.34 compiling',
      'Image bros:latest Building',
      '#27 ERROR: process "/bin/sh -c pnpm --filter @bros/ui build" did not complete successfully: exit code: 1',
      'Cannot stop container bros-apps',
    ].join('\n')
    const out = filterStop(input, 'BROS_FILTER_STOP=1')
    expect(out).not.toContain('Building image…')
    expect(out).not.toContain('Image bros:latest')
    expect(out).not.toContain('#27 [build')
    expect(out).toBe([
      '#27 ERROR: process "/bin/sh -c pnpm --filter @bros/ui build" did not complete successfully: exit code: 1',
      'Cannot stop container bros-apps',
    ].join('\n'))

    const flag = join(tmpdir(), `bros-filter-stop-${process.pid}`)
    writeFileSync(flag, '')
    const inflight = filterStop(input, `BROS_FILTER_STOP_FILE='${flag}'`)
    rmSync(flag, { force: true })
    expect(inflight).not.toContain('Building image…')
    expect(inflight).toContain('#27 ERROR:')
    expect(inflight).toContain('Cannot stop container bros-apps')
  })

  it('drops a Building image… line that reaches the prefix after stop', () => {
    const flag = join(tmpdir(), `bros-prefix-stop-${process.pid}`)
    writeFileSync(flag, '')
    const fn = logFns(src, ['split_records', 'strip_ansi_line', 'suppress_build_summary', 'prefix_lines'])
    const out = bash(`set -euo pipefail
BROS_FILTER_STOP_FILE=${JSON.stringify(flag)}
${fn}
printf '%s\\n' 'Building image…' 'Stopping Bros (full stack)…' | prefix_lines
`).replace(/\n$/, '')
    rmSync(flag, { force: true })
    expect(out).not.toContain('Building image…')
    expect(out).toContain('Stopping Bros (full stack)…')
  })
})

describe('bros start output', () => {
  const src = readFileSync(BROS, 'utf8')

  function filterLines(input: string, env = '') {
    const fn = logFns(src, ['split_records', 'strip_ansi_line', 'suppress_build_summary', 'filter_lines', 'prefix_lines'])
    return bash(`set -euo pipefail
${env}
${fn}
filter_lines <<'EOF' | prefix_lines
${input}
EOF`).replace(/\n$/, '')
  }

  function filterLinesPty(input: string) {
    const fn = logFns(src, ['split_records', 'strip_ansi_line', 'suppress_build_summary', 'filter_lines', 'prefix_lines'])
    return bashPty(`set -euo pipefail
${fn}
filter_lines <<'EOF' | prefix_lines
${input}
EOF`)
  }

  it('pipes image build and the start follow-up through the log filter', () => {
    const start = extractFn(src, 'cmd_start')
    expect(start).toContain('compose_up -d 2>&1 | filter_lines | prefix_lines')
    expect(start).toContain('compose_up 2>&1 | filter_lines | prefix_lines')
    expect(start).toContain('exec_node start 2>&1 | filter_lines | prefix_lines')
    expect(start).not.toMatch(/compose_up -d 2>&1 \| prefix_lines$/)
  })

  it('hides the Nitro file list and BuildKit steps, and keeps the build error', () => {
    const input = [
      '#1 [internal] load build definition from Dockerfile',
      '#1 transferring dockerfile: 2.45kB done',
      '#27 [build 7/7] RUN pnpm --filter @bros/ui build',
      '#27 12.34 .output/server/chunks/nitro/nitro.mjs (182 kB) (45 kB gzip)',
      '#27 12.35   ├─ .output/server/chunks/build/index.mjs (4 kB) (2 kB gzip)',
      '#27 40.00 Build complete',
      '#27 39.00 npm ERR! Command failed',
      '#27 ERROR: process "/bin/sh -c pnpm --filter @bros/ui build" did not complete successfully: exit code: 1',
      'ERROR: failed to solve: process "/bin/sh -c pnpm --filter @bros/ui build" did not complete successfully: exit code: 1',
      ' Container bros Creating ',
      ' Container bros Created ',
      ' Container bros Starting ',
      ' Container bros Started ',
    ].join('\n')
    expect(filterLines(input)).toBe([
      '[bros] Building image…',
      '[bros] #27 39.00 npm ERR! Command failed',
      '[bros] #27 ERROR: process "/bin/sh -c pnpm --filter @bros/ui build" did not complete successfully: exit code: 1',
      '[bros] ERROR: failed to solve: process "/bin/sh -c pnpm --filter @bros/ui build" did not complete successfully: exit code: 1',
      '[bros] Starting container…',
    ].join('\n'))
  })

  it('keeps one prefix and drops consola level words', () => {
    const input = [
      '[bros] [bros] passkey: example',
      '[bros] passkey file: /app/data/passkey',
      '[bros] [bros] proxy key: example',
      '[bros] proxy key file: /app/data/proxy-key',
      'info Starting Ollama sidecar (bros-sc-ollama)…',
      'success Internal model bros is current.',
    ].join('\n')
    expect(filterLines(input)).toBe([
      '[bros] passkey: example',
      '[bros] passkey file: /app/data/passkey',
      '[bros] proxy key: example',
      '[bros] proxy key file: /app/data/proxy-key',
      '[bros] Starting Ollama sidecar (bros-sc-ollama)…',
      '[bros] Internal model bros is current.',
    ].join('\n'))
  })

  it('prints every container state on its own line when stdout is not a tty', () => {
    const input = [
      'Container bros-sc-ollama-ollama-1 Stopping',
      'Container bros-sc-ollama-ollama-1 Stopped',
      'Container bros-sc-ollama-ollama-1 Removing',
      'Container bros-sc-ollama-ollama-1 Removed',
      'Container bros Stopping',
      'Container bros Stopped',
      'Container bros Removing',
      'Container bros Removed',
      'Network bros_default Removing',
      'Network bros_default Removed',
    ].join('\n')
    const out = filterLines(input)
    expect(out).not.toContain('\r')
    expect(out).toBe([
      '[bros] Container bros-sc-ollama-ollama-1 Stopping',
      '[bros] Container bros-sc-ollama-ollama-1 Stopped',
      '[bros] Container bros-sc-ollama-ollama-1 Removing',
      '[bros] Container bros-sc-ollama-ollama-1 Removed',
      '[bros] Container bros Stopping',
      '[bros] Container bros Stopped',
      '[bros] Container bros Removing',
      '[bros] Container bros Removed',
      '[bros] Network bros_default Removing',
      '[bros] Network bros_default Removed',
    ].join('\n'))
  })

  it('rewrites one line per container on a tty and keeps interleaved names apart', () => {
    const sequential = [
      'Container bros-sc-ollama-ollama-1 Stopping',
      'Container bros-sc-ollama-ollama-1 Stopped',
      'Container bros-sc-ollama-ollama-1 Removing',
      'Container bros-sc-ollama-ollama-1 Removed',
      'Container bros Stopping',
      'Container bros Stopped',
      'Network bros_default Removing',
      'Network bros_default Removed',
    ].join('\n')
    const sequentialRaw = filterLinesPty(sequential)
    expect(sequentialRaw).toContain('\r')
    expect(sequentialRaw).toContain('\x1b[K')
    expect(visibleLines(sequentialRaw)).toEqual([
      '[bros] Container bros-sc-ollama-ollama-1 Removed',
      '[bros] Container bros Stopped',
      '[bros] Network bros_default Removed',
    ])

    const interleaved = [
      'Container openjev Stopping',
      'Container laya Stopping',
      'Container verdict Stopping',
      'Container openjev Stopped',
      'Container laya Stopped',
      'Container verdict Removed',
    ].join('\n')
    expect(visibleLines(filterLinesPty(interleaved))).toEqual([
      '[bros] Container openjev Stopping',
      '[bros] Container laya Stopping',
      '[bros] Container verdict Stopping',
      '[bros] Container openjev Stopped',
      '[bros] Container laya Stopped',
      '[bros] Container verdict Removed',
    ])
  })

  it('left-aligns carriage-return progress and hides the compose image pair', () => {
    const input = [
      'Image bros:latest Building\r\x1b[K   Image bros:latest Built',
      '#1 [internal] load build definition from Dockerfile',
      'gathering model components\rcopying file sha256:abc   10%\r   copying file sha256:abc  100%',
      'parsing GGUF ⠋ gathering model components',
      '   Attaching to bros',
      'info passkey: example',
    ].join('\n')
    const out = filterLines(input)
    expect(out).not.toContain('\r')
    expect(out).not.toMatch(/^\s+\[bros\]/m)
    expect(out).not.toContain('Image bros:latest')
    expect(out.split('\n').every((line) => line.startsWith('[bros] '))).toBe(true)
    expect(out).toBe([
      '[bros] Building image…',
      '[bros] copying file sha256:abc  100%',
      '[bros] parsing GGUF ⠋ gathering model components',
      '[bros] Attaching to bros',
      '[bros] passkey: example',
    ].join('\n'))

    const tty = visibleLines(filterLinesPty(input))
    expect(tty.every((line) => line.startsWith('[bros] '))).toBe(true)
    expect(tty).toEqual([
      '[bros] Building image…',
      '[bros] copying file sha256:abc  100%',
      '[bros] parsing GGUF ⠋ gathering model components',
      '[bros] Attaching to bros',
      '[bros] passkey: example',
    ])
  })

  it('homes ollama carriage-return progress and drops a bare success', () => {
    const input = [
      'Starting Ollama sidecar (bros-sc-ollama)…',
      'Creating Ollama model bros…\rgathering model components\rcopying file sha256:abc 100%\rparsing GGUF\r⠋ gathering model components\rusing existing layer sha256:abc\rwriting manifest\rsuccess',
    ].join('\n')
    const out = filterLines(input)
    expect(out).not.toContain('\r')
    expect(out).not.toContain('parsing GGUF ⠋')
    expect(out).not.toMatch(/^\[bros\] success$/m)
    expect(out).toBe([
      '[bros] Starting Ollama sidecar (bros-sc-ollama)…',
      '[bros] writing manifest',
    ].join('\n'))

    const tty = filterLinesPty(input)
    const startAt = tty.indexOf('Starting Ollama sidecar (bros-sc-ollama)…')
    const newlineAt = tty.indexOf('\n', startAt)
    const redrawAt = tty.indexOf('\r\x1b[2K', startAt)
    expect(startAt).toBeGreaterThanOrEqual(0)
    expect(newlineAt).toBeGreaterThan(startAt)
    expect(redrawAt).toBeGreaterThan(newlineAt)
    const homes = tty.match(/\r\x1b\[2K(?:\x1b\[34m)?\[bros\]/g) ?? []
    expect(homes.length).toBeGreaterThanOrEqual(7)
    expect(tty).not.toContain('parsing GGUF ⠋')
    expect(tty).not.toMatch(/\[bros\](?:\x1b\[0m)? success(?:\r|\n|$)/)

    const frame = (line: string) => `\x1b[?2026h\x1b[?25l\x1b[1G${line}\x1b[K\x1b[?25h\x1b[?2026l`
    const csi = `Starting Ollama sidecar (bros-sc-ollama)…\n${frame('parsing GGUF ⠋ ')}${frame('gathering model components ⠙ ')}\n`
    const csiTty = filterLinesPty(csi)
    expect(csiTty).not.toContain('parsing GGUF ⠋ gathering')
    expect(csiTty).toContain('\r\x1b[2K')
    expect(visibleLines(csiTty)).toEqual([
      '[bros] Starting Ollama sidecar (bros-sc-ollama)…',
      '[bros] gathering model components ⠙',
    ])
  })

  it('shows compose image lines when verbose', () => {
    const input = [
      'Image bros:latest Building',
      'Image bros:latest Built',
      '#1 [internal] load build definition from Dockerfile',
    ].join('\n')
    expect(filterLines(input, 'VERBOSE=1')).toBe([
      '[bros] Image bros:latest Building',
      '[bros] Image bros:latest Built',
      '[bros] Building image…',
    ].join('\n'))
  })

  it('start follow-up does not print consola level words', () => {
    const cli = readFileSync(join(REPO, 'src/cli/index.ts'), 'utf8')
    const body = cli.slice(cli.indexOf('async function installModel'), cli.indexOf('async function runStart'))
    expect(body).toContain("console.log('Starting Ollama sidecar (bros-sc-ollama)…')")
    expect(body).toContain("console.log('Internal model bros is current.')")
    expect(body).not.toContain('consola.info')
    expect(body).not.toContain('consola.success')
  })
})

describe('desktop sidecar image context', () => {
  it('resolves Dockerfile COPY sources from the host checkout, not the prod core mount', () => {
    const compose = readFileSync(join(REPO, 'lib/sidecars/core/desktop/docker-compose.yml'), 'utf8')
    const dockerfile = readFileSync(join(REPO, 'lib/sidecars/core/desktop/Dockerfile'), 'utf8')
    const update = readFileSync(join(REPO, 'src/cli/index.ts'), 'utf8')
    const body = update.slice(update.indexOf('async function runUpdate'), update.indexOf('async function gitDirty'))
    expect(body.indexOf('prepareDesktopAppBuild()')).toBeLessThan(body.indexOf("'-f', join(cliDir, 'docker-compose.yml'), 'build'"))
    expect(body.indexOf("'-f', join(cliDir, 'docker-compose.yml'), 'build'")).toBeLessThan(body.indexOf("containerRunning('bros-desktop')"))
    expect(body.indexOf("containerRunning('bros-desktop')")).toBeLessThan(body.indexOf("containerRunning('bros')"))
    expect(body).toContain("composeArgs(['up', '-d', '--no-deps', 'bros'])")
    expect(body).toContain('writeDesktopAppStamp(prep.hash)')
    expect(body).toContain("composeArgs(['build'])")
    expect(body).not.toContain('--pull')
    expect(body).not.toContain("'pull', '--ff-only'")
    expect(body).not.toContain("composeArgs(['pull'])")
    expect(body).not.toContain('Restart to run new images')
    const script = readFileSync(join(REPO, 'bros'), 'utf8')
    const hostUpdate = script.slice(script.indexOf('update|upgrade)'), script.indexOf('\n  *)', script.indexOf('update|upgrade)')))
    expect(hostUpdate.indexOf('git -C "$REPO_ROOT" pull --ff-only')).toBeGreaterThan(-1)
    expect(hostUpdate.indexOf('git -C "$REPO_ROOT" pull --ff-only')).toBeLessThan(hostUpdate.indexOf('compose build'))
    expect(hostUpdate).toContain('git -C "$REPO_ROOT" submodule update --init')
    expect(compose).toContain('context: ${BROS_HOST_DATA_DIR:?unset}/build/desktop')
    expect(compose).toContain('sidecars: ${BROS_HOST_REPO:?unset}/lib/sidecars')
    expect(compose).not.toMatch(/context:\s*\.\.\/\.\./)
    const sources = dockerfile.split('\n').flatMap((raw) => {
      const line = raw.trim()
      if (!line.startsWith('COPY ') || line.includes('--from')) return []
      const src = line.split(/\s+/)[1]
      return src ? [src] : []
    })
    expect(sources).toContain('core/desktop/install.mjs')
    expect(sources).toContain('core/desktop/desktop-gui.sh')
    const context = join(REPO, 'lib/sidecars')
    for (const src of sources) {
      expect(existsSync(join(context, src)), src).toBe(true)
    }
    expect(dockerfile).toContain('ENV HOME=/home/bros')
    expect(dockerfile).toContain('ENV PATH="/home/bros/.local/sidecar-bins:$PATH"')
    expect(dockerfile).not.toContain('.nix-profile/bin:')
    expect(dockerfile).not.toContain('pnpm@${PNPM_VERSION}')
    expect(dockerfile).not.toContain('bun.sh/install')
    expect(dockerfile).not.toContain('deno.land/install.sh')
    expect(dockerfile).not.toContain('astral-sh/uv/releases/download/${UV_VERSION}')
    expect(dockerfile).not.toContain('jetify-com/devbox/releases/download')
    expect(dockerfile).not.toContain('releases.nixos.org')
    expect(dockerfile).not.toContain('BROS_DEVBOX_VERSION')
    expect(compose).not.toContain('BROS_DEVBOX_VERSION')
    expect(readFileSync(join(REPO, 'docker-compose.yml'), 'utf8')).not.toContain('BROS_DEVBOX_VERSION')
    expect(dockerfile).toContain('XDG_DATA_HOME=/home/bros/.local/share')
    expect(dockerfile).not.toContain('home-dir /home/bros/.nix')
    expect(dockerfile).not.toContain('nixos.org/nix/install')
    expect(dockerfile).not.toContain('BROS_APP_BAKE')
    const live = readFileSync(join(REPO, 'lib/sidecars/core/desktop/root/custom-cont-init.d/bros-live'), 'utf8')
    expect(live).toContain('curl -fsSL https://get.jetify.com/devbox | bash')
    expect(live).toContain('command -v devbox >/dev/null')
    expect(live).toContain('/nix/store/*-nix-*/bin/nix')
    expect(live).not.toContain('nixos.org/nix/install')
    expect(live).toContain('build-users-group =')
    expect(live).toContain('use-xdg-base-directories = true')
    expect(live).not.toContain('HOME=/home/bros/.nix')
    expect(live).not.toContain('install.mjs --kind nix')
    const ensureScript = readFileSync(join(REPO, 'lib/sidecars/core/desktop/ensure.sh'), 'utf8')
    expect(ensureScript).toContain('chown "${PUID:-1000}:${PGID:-1000}" "$HOME_DIR/.local/share/devbox"')
    expect(ensureScript).toContain('chown "$uid:$gid" /nix/store')
    expect(ensureScript).toContain('chown "$uid:$gid" "$XDG_STATE_HOME/nix"')
    expect(ensureScript).toContain('chown "$uid:$gid" /nix/var/nix/db')
    expect(ensureScript).toContain('chown "$uid:$gid" "$d"')
    expect(ensureScript).toContain('/nix/var/nix/temproots')
    expect(ensureScript).not.toContain('chown -R')
    expect(ensureScript).not.toContain('nixos.org/nix/install')
    expect(ensureScript).not.toContain('curl -fsSL https://get.jetify.com/devbox')
    expect(ensureScript).toContain('/nix/store/*-nix-*/bin/nix')
    expect(ensureScript).toContain('devbox global shellenv')
    expect(ensureScript).toContain('export PATH="/home/bros/.local/sidecar-bins:$PATH"')
    expect(ensureScript).toContain('as_user "node $(printf \'%q\' "$INSTALL") --only')
    expect(ensureScript).not.toContain('if node "$INSTALL"')
    expect(readFileSync(join(REPO, 'lib/sidecars/core/desktop/managers/deb.mjs'), 'utf8')).toContain('sudo -n')
    expect(ensureScript).toContain('HOME="$HOME_DIR"')
    expect(ensureScript).toContain('XDG_DATA_HOME="$HOME_DIR/.local/share"')
    expect(ensureScript).not.toContain('HOME=/home/bros/.nix')
    expect(compose).toContain('${BROS_HOST_DATA_DIR:?unset}/home/nix:/nix')
    expect(compose).toContain('XDG_DATA_HOME: /home/bros/.local/share')
    expect(compose).toContain('XDG_STATE_HOME: /home/bros/.local/state')
    expect(compose).toContain('${BROS_HOST_DATA_DIR:?unset}/cache/apt/archives:/var/cache/apt/archives')
    expect(compose).toContain('${BROS_HOST_DATA_DIR:?unset}/cache/deb:/var/cache/bros/debs')
    expect(compose).toContain('${BROS_HOST_DATA_DIR:?unset}/var/logs:/var/log/bros')
    const nixManager = readFileSync(join(REPO, 'lib/sidecars/core/desktop/managers/nix.mjs'), 'utf8')
    expect(nixManager).toContain('devbox global add')
    expect(nixManager).toContain('HOME=/home/bros')
    expect(nixManager).toContain('XDG_DATA_HOME=/home/bros/.local/share')
    expect(nixManager).not.toContain('XDG_DATA_HOME=/home/bros/.nix/devbox')
    expect(nixManager).not.toContain('file:///var/cache/bros/nix')
    expect(nixManager).toContain('devbox global shellenv')
    expect(nixManager).not.toContain('.nix-profile/bin')
    expect(nixManager).not.toContain('nix profile install')
    expect(nixManager).not.toContain('get.jetify.com')
    const host = readFileSync(join(REPO, 'bros'), 'utf8')
    expect(host).toContain('node -v')
    expect(host).toContain('BROS_NODE_VERSION="${node_ver:-26.7.0}"')
    const hostDirs = host.slice(host.indexOf('ensure_host_data_dir()'), host.indexOf('compose_files()'))
    expect(hostDirs).toContain('cache/apt/archives')
    expect(hostDirs).toContain('cache/deb')
    expect(hostDirs).toContain('home/nix')
    expect(readFileSync(join(REPO, 'lib/sidecars/core/desktop/install.mjs'), 'utf8')).not.toContain('get.jetify.com')
    expect(dockerfile).not.toContain('xpra')
  })
})

describe('sidecar autostart and start errors', () => {
  it('does not autostart during prerender', () => {
    expect(shouldRunAutostart(true)).toBe(false)
    expect(shouldRunAutostart(false)).toBe(true)
    const middleware = readFileSync(join(REPO, 'src/server/middleware/01-auth.ts'), 'utf8')
    expect(middleware).toContain('shouldRunAutostart() && !autostartDone')
  })

  it('puts docker output in message so h3 does not warn on statusMessage', () => {
    const detail = 'failed to solve: "/core/desktop/install.mjs": not found\n#27 ERROR'
    const body = dockerCommandError(500, 'Failed to start sidecar', detail)
    expect(body.statusMessage).toBe('Failed to start sidecar')
    expect(body.message).toBe(detail)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const err = createError(body)
      expect(err.statusMessage).toBe('Failed to start sidecar')
      expect(err.message).toContain('core/desktop/install.mjs')
      expect(warn).not.toHaveBeenCalled()
    }
    finally {
      warn.mockRestore()
    }
  })
})

describe('bros CLI flags and help', () => {
  it('accepts --dev the same as BROS_DEV=1', () => {
    const src = readFileSync(BROS, 'utf8')
    expect(src).toMatch(/--dev\)\n\s+DEV=1\n\s+export BROS_DEV=1/)
    const out = execFileSync(BROS, ['--dev', '--version'], { encoding: 'utf8' })
    expect(out).toMatch(/^bros /)
  })

  it('help documents --dev and BROS_DEV=1', () => {
    const out = execFileSync(BROS, ['--help'], { encoding: 'utf8' })
    expect(out).toContain('--dev')
    expect(out).toContain('BROS_DEV=1')
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

describe('interactive Ctrl+C', () => {
  const src = readFileSync(BROS, 'utf8')

  function bashPtySignal(script: string, signals: number) {
    const py = `
import os, select, time, sys
script = sys.stdin.buffer.read()
master, slave = os.openpty()
pid = os.fork()
if pid == 0:
    os.close(master)
    os.setsid()
    os.dup2(slave, 0)
    os.dup2(slave, 1)
    os.dup2(slave, 2)
    if slave > 2:
        os.close(slave)
    os.execvp('bash', ['bash', '--noprofile', '--norc', '-c', script.decode()])
os.close(slave)
data = bytearray()
start = time.time()
sent = 0
armed = None
status = None
while time.time() - start < 8:
    ready, _, _ = select.select([master], [], [], 0.05)
    now = time.time()
    if master in ready:
        try:
            chunk = os.read(master, 65536)
        except OSError:
            chunk = b''
        if chunk:
            data += chunk
            if armed is None and sent < ${signals} and b'COMPOSE_READY' in data:
                armed = now + 0.25
    if armed is not None and sent < ${signals} and now >= armed:
        os.write(master, b'\\x03')
        sent += 1
        armed = now + 0.35 if sent < ${signals} else None
    try:
        wpid, st = os.waitpid(pid, os.WNOHANG)
    except ChildProcessError:
        break
    if wpid:
        status = st
        break
else:
    os.kill(pid, 9)
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass
    status = None
deadline = time.time() + 0.3
while time.time() < deadline:
    ready, _, _ = select.select([master], [], [], 0.05)
    if not ready:
        break
    try:
        chunk = os.read(master, 65536)
    except OSError:
        break
    if not chunk:
        break
    data += chunk
os.close(master)
sys.stdout.buffer.write(data)
if status is None:
    sys.exit(124)
sys.exit(os.waitstatus_to_exitcode(status))
`
    return spawnSync('python3', ['-c', py], { input: script, encoding: 'utf8', timeout: 12000 })
  }

  function signalScript(stopBody: string, composeUp?: string) {
    const fns = ['kill_sid', 'kill_tree', 'kill_job', 'on_interactive_signal', 'cmd_start']
      .map((name) => extractFn(src, name))
      .join('\n')
    const up = composeUp ?? `compose_up() {
  trap 'echo COMPOSE_INT' INT TERM
  printf '%s\\n' COMPOSE_READY
  sleep 30
  printf '%s\\n' BROS_SIGINT_FIXTURE_DONE
}`
    return `set -euo pipefail
apply_config_env() { :; }
ensure_host_data_dir() { :; }
spin_until_ui() { :; }
bros_tunnel_cleanup_sidecar() { :; }
bros_tunnel_startup() { :; }
ensure_bros_network() { :; }
ensure_bros_x11() { :; }
exec_node() { :; }
prefix_lines() {
  if [[ \$# -gt 0 ]]; then
    printf '%s\\n' "\$*"
    return 0
  fi
  cat
}
filter_lines() { cat; }
compose() { return 1; }
compose_files() { printf '%s\\n' '-f test'; }
${up}
stop_full_stack() { ${stopBody}; }
${fns}
DEV=1
DAEMON=0
VERBOSE=0
REPO_ROOT=/tmp
cmd_start
`
  }

  it('arms the shell trap and does not leave SIGINT to docker compose', () => {
    const start = extractFn(src, 'cmd_start')
    const signal = extractFn(src, 'on_interactive_signal')
    const kill = extractFn(src, 'kill_job')
    const tree = extractFn(src, 'kill_tree')
    expect(start.indexOf('trap on_interactive_signal')).toBeGreaterThan(-1)
    expect(start.indexOf('trap on_interactive_signal')).toBeLessThan(start.indexOf('COMPOSE_PGID=$!'))
    expect(start).toContain('trap - INT TERM')
    expect(start).toContain('</dev/null | filter_lines | prefix_lines')
    expect(start).toContain('compose_up 2>&1 | filter_lines | prefix_lines')
    expect(start).toContain('stop_full_stack')
    expect(start).not.toContain('kill -INT')
    expect(signal).toContain('BROS_STOPPING=1')
    expect(signal).toContain('BROS_FORCE=1')
    expect(signal).toContain('kill_job')
    expect(signal).toContain('kill_job "${COMPOSE_PGID:-}"')
    expect(signal).not.toContain('stop_full_stack')
    expect(signal).not.toContain('exit ')
    expect(signal).not.toContain('wait "$')
    const stopAt = start.indexOf('stop_full_stack')
    const arm = start.indexOf('if [[ "${BROS_STOPPING:-0}" -eq 1')
    expect(arm).toBeGreaterThan(-1)
    expect(arm).toBeLessThan(stopAt)
    expect(start.slice(arm, stopAt)).toContain('kill_job "${COMPOSE_PGID:-}"')
    expect(start.slice(arm, stopAt)).not.toContain('wait "$COMPOSE_PGID"')
    expect(kill).toContain('kill_tree')
    expect(tree).toContain('kill -KILL')
    expect(kill).not.toContain('kill -INT')
    expect(kill).not.toContain('kill -TERM')
    expect(tree).not.toContain('kill -INT')
    expect(tree).not.toContain('kill -TERM')
  })

  it('one SIGINT runs full-stack stop and does not reach compose', () => {
    const result = bashPtySignal(signalScript("printf '%s\\n' FULL_STACK_STOP"), 1)
    const out = result.stdout ?? ''
    expect(result.status, out).toBe(0)
    expect(out).toContain('Stopping Bros (full stack)…')
    expect(out).toContain('FULL_STACK_STOP')
    expect(out).not.toContain('COMPOSE_INT')
    expect(out).not.toContain('BROS_SIGINT_FIXTURE_DONE')
    expect(out).not.toContain('Killed')
  }, 15000)

  it('SIGINT SIGKILLs a TERM-ignoring build child and stops without waiting', () => {
    const pidFile = join(tmpdir(), `bros-term-child-${process.pid}-${Date.now()}`)
    const composeUp = `compose_up() {
  trap '' INT TERM
  printf '%s\\n' COMPOSE_READY
  bash --noprofile --norc -c 'trap "" INT TERM; sleep 30; printf "%s\\n" GRANDCHILD_DONE' &
  printf '%s\\n' "$!" > '${pidFile}'
  wait
  printf '%s\\n' BROS_SIGINT_FIXTURE_DONE
}`
    const result = bashPtySignal(signalScript("printf '%s\\n' FULL_STACK_STOP", composeUp), 1)
    const out = result.stdout ?? ''
    expect(existsSync(pidFile), out).toBe(true)
    const pid = readFileSync(pidFile, 'utf8').trim()
    const stat = spawnSync('ps', ['-o', 'stat=', '-p', pid], { encoding: 'utf8' })
    const state = (stat.stdout ?? '').trim()
    const alive = state.length > 0 && !state.includes('Z')
    if (alive) spawnSync('kill', ['-KILL', pid])
    rmSync(pidFile, { force: true })
    expect(result.status, out).toBe(0)
    expect(out).toContain('FULL_STACK_STOP')
    expect(out).not.toContain('GRANDCHILD_DONE')
    expect(out).not.toContain('BROS_SIGINT_FIXTURE_DONE')
    expect(alive, out).toBe(false)
  }, 15000)

  it('a second SIGINT force-kills a stop that is still running', () => {
    const result = bashPtySignal(
      signalScript("printf '%s\\n' FULL_STACK_STOP; sleep 8; printf '%s\\n' STOP_FINISHED"),
      2,
    )
    const out = result.stdout ?? ''
    expect(result.status, out).toBe(130)
    expect(out).toContain('FULL_STACK_STOP')
    expect(out).not.toContain('STOP_FINISHED')
    expect(out).not.toContain('COMPOSE_INT')
    expect(out).not.toContain('Killed')
  }, 15000)
})

describe('workspace package scripts', () => {
  it('ui:dev runs the app filter from src/', () => {
    const pkg = JSON.parse(readFileSync(join(REPO, 'src/package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts.dev).toBeUndefined()
    expect(pkg.scripts['dev:update']).toBeUndefined()
    expect(pkg.scripts['ui:dev']).toBe('pnpm --filter @bros/ui dev')
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
