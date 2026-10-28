import { spawn } from 'node:child_process'
import { dockerArgs } from './desktop'

type Rpc = {
  jsonrpc?: string
  id?: number
  method?: string
  params?: {
    sessionId?: string
    update?: { sessionUpdate?: string, content?: { text?: string }, title?: string, status?: string }
    options?: Array<{ optionId?: string }>
  }
  result?: { sessionId?: string, stopReason?: string }
  error?: { message?: string }
}

export async function runCursorAcp(input: {
  cwd: string
  prompt: string
  env?: Record<string, string>
  timeoutMs: number
  onEvent: (kind: string, message: string) => void
}): Promise<void> {
  const child = spawn('docker', dockerArgs({
    argv: ['/home/bros/.local/bin/cursor-agent', 'acp'],
    cwd: input.cwd,
    env: input.env,
  }), { stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (buf: Buffer) => { stderr += String(buf) })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
  }, input.timeoutMs)
  let nextId = 1
  const pending = new Map<number, { resolve: (row: Rpc) => void, reject: (err: Error) => void }>()
  let buffer = ''

  const fail = (err: Error) => {
    for (const waiter of pending.values()) waiter.reject(err)
    pending.clear()
  }

  const send = (method: string, params: unknown) => {
    const id = nextId++
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    return new Promise<Rpc>((resolve, reject) => pending.set(id, { resolve, reject }))
  }

  const respond = (id: number, result: unknown) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
  }

  child.stdout.on('data', (buf: Buffer) => {
    buffer += String(buf)
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      let row: Rpc
      try {
        row = JSON.parse(line) as Rpc
      }
      catch {
        continue
      }
      if (row.id !== undefined && row.method === 'session/request_permission') {
        const option = row.params?.options?.find((item) => item.optionId === 'allow-once') || row.params?.options?.[0]
        respond(row.id, { outcome: { outcome: 'selected', optionId: option?.optionId || 'allow-once' } })
        continue
      }
      if (row.method === 'session/update') {
        const update = row.params?.update
        if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.text) {
          input.onEvent('message', update.content.text)
        }
        else if (update?.sessionUpdate === 'tool_call') {
          input.onEvent('tool', update.title || 'tool')
        }
        continue
      }
      if (row.id !== undefined && pending.has(row.id)) {
        const waiter = pending.get(row.id)!
        pending.delete(row.id)
        if (row.error) waiter.reject(new Error(row.error.message || 'acp error'))
        else waiter.resolve(row)
      }
    }
  })

  const closed = new Promise<number>((resolve) => {
    child.on('error', (err) => {
      fail(err)
      resolve(1)
    })
    child.on('close', (code) => {
      fail(new Error(timedOut ? 'timed out' : (stderr.trim() || `agent exited ${code ?? 1}`)))
      resolve(code ?? 1)
    })
  })

  try {
    await send('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'bros', version: '0.1.0' },
    })
    try {
      await send('authenticate', { methodId: 'cursor_login' })
    }
    catch {
      // Existing login or CURSOR_API_KEY.
    }
    const created = await send('session/new', { cwd: input.cwd, mcpServers: [] })
    const sessionId = created.result?.sessionId
    if (!sessionId) throw new Error('ACP session did not start')
    const prompted = await send('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text: input.prompt }],
    })
    input.onEvent('exit', prompted.result?.stopReason || 'end_turn')
  }
  finally {
    clearTimeout(timer)
    child.kill('SIGTERM')
    await closed
  }
  if (stderr.trim()) input.onEvent('stderr', stderr.trim().slice(0, 2000))
}
