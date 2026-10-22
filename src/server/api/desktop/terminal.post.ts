import { dockerCommandError, ensureAppsRunning, execInSidecar } from '../../utils/docker'

const script = '/app/lib/sidecars/core/desktop/desktop-gui.sh'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ open?: boolean }>(event).catch(() => ({ open: true }))
  await ensureAppsRunning()
  const open = body?.open !== false
  const args = open
    ? [script, 'start', 'terminal', '--', 'foot', '--working-directory=/home/bros/workspace']
    : [script, 'stop', 'terminal']
  const res = await execInSidecar('desktop', args)
  if (res.code !== 0) {
    throw createError(dockerCommandError(500, open ? 'Desktop app failed to start' : 'Desktop app failed to stop', res.stderr || res.stdout || 'Desktop app failed to start'))
  }
  return { ok: true }
})
