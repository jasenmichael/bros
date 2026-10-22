import { INTERNAL_BROS_MODEL } from '../internalBrosModel'
import { ollamaBaseUrlFor, OLLAMA_SIDECAR_ID } from '../providers'

/** Sidecar specialist `bros`. Short `Label:` tag. Ignores the conversation model. */
export async function specialistLabel(userText: string): Promise<string> {
  const base = await ollamaBaseUrlFor(OLLAMA_SIDECAR_ID)
  const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: INTERNAL_BROS_MODEL,
      stream: false,
      messages: [{ role: 'user', content: `Label: ${userText}` }],
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json() as { message?: { content?: string } }
  return String(json.message?.content || '')
}
