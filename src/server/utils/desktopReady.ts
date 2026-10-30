import { execFile } from 'node:child_process'

const SCRIPT = '/app/lib/desktop/desktop-ready.sh'
const FALLBACK = 'selkies ttyd x11 wayland'

function readDesktopReady(): Promise<{ code: number, gaps: string }> {
  return new Promise((resolve) => {
    execFile('docker', ['exec', 'bros', 'bash', SCRIPT], { timeout: 15_000 }, (err, stdout) => {
      const code = typeof (err as { code?: unknown } | null)?.code === 'number'
        ? (err as { code: number }).code
        : err ? 1 : 0
      resolve({ code, gaps: String(stdout || '').trim() })
    })
  })
}

/** Empty string when the Desktop session answers. Otherwise the gap words after 90s. */
export async function waitForDesktopSession(timeoutMs = 90_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let gaps = FALLBACK
  for (;;) {
    const ready = await readDesktopReady()
    if (ready.code === 0 && !ready.gaps) return ''
    if (ready.gaps) gaps = ready.gaps
    const left = deadline - Date.now()
    if (left <= 0) return gaps
    await new Promise((resolve) => setTimeout(resolve, Math.min(2000, left)))
  }
}
