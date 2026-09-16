import { createProxyServer } from 'httpxy'
import { RESERVED_SLUGS, resolveWebUiTargets } from '../utils/sidecars'

const proxy = createProxyServer({})

function publicHostname(event: Parameters<typeof getRequestHeader>[0]) {
  const raw = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host') || 'localhost'
  return raw.split(':')[0]
}

function publicProto(event: Parameters<typeof getRequestHeader>[0]) {
  return getRequestHeader(event, 'x-forwarded-proto') || getRequestURL(event).protocol.replace(':', '') || 'http'
}

/**
 * Path proxy: /<slug>/… → http://<service>:<port>/…
 * Apps with hostPort (e.g. Open WebUI) redirect to host:port — they break under a path prefix.
 */
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const parts = url.pathname.split('/').filter(Boolean)
  const slug = parts[0]
  if (!slug || RESERVED_SLUGS.has(slug) || slug.startsWith('_')) {
    return
  }

  const target = resolveWebUiTargets().find((t) => t.slug === slug)
  if (!target) return

  if (target.hostPort) {
    const dest = `${publicProto(event)}://${publicHostname(event)}:${target.hostPort}/`
    return sendRedirect(event, dest, 302)
  }

  const rest = '/' + parts.slice(1).join('/')
  const search = url.search || ''
  event.node.req.url = `${rest === '/' ? '/' : rest}${search}`

  try {
    await proxy.web(event.node.req, event.node.res, {
      target: `http://${target.service}:${target.port}`,
      changeOrigin: true,
      ws: true,
      xfwd: true,
    })
    event._handled = true
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: err instanceof Error ? err.message : 'Proxy failed',
    })
  }
})
