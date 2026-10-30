import { ofetch } from 'ofetch'

export type LaunchRef = {
  kind: 'terminal' | 'package' | 'docker' | 'entry'
  id: string
  command?: string
}

const api = ofetch.create({ credentials: 'same-origin' })

export async function launchDesktop(app: LaunchRef, action: 'open' | 'close' | 'focus') {
  if (action === 'focus') {
    await api('/api/desktop/focus', { method: 'POST', body: { kind: app.kind, id: app.id, command: app.command } })
    return
  }
  if (app.kind === 'terminal') {
    await api('/api/desktop/terminal', { method: 'POST', body: action === 'close' ? { close: true } : { open: true } })
    return
  }
  if (app.kind === 'package') {
    const path = action === 'close' ? 'close' : 'open'
    await api(`/api/apps/${app.id}/${path}`, {
      method: 'POST',
      body: { command: app.command, ...(action === 'close' ? { one: true } : {}) },
    })
    return
  }
  if (app.kind === 'core') {
    const path = action === 'close' ? 'stop' : 'start'
    await api(`/api/apps/${app.id}/${path}`, {
      method: 'POST',
      body: { gui: true, ...(action === 'close' ? { one: true } : {}) },
    })
    return
  }
  await api('/api/desktop/entry', { method: 'POST', body: { id: app.id, close: action === 'close' } })
}
