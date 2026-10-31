import { suggestCliPackages } from '../../utils/cli/suggest'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const kind = typeof query.kind === 'string' ? query.kind : ''
  const q = typeof query.q === 'string' ? query.q : ''
  try {
    return { names: await suggestCliPackages(kind, q) }
  } catch (err) {
    console.error('[bros] cli suggest', err instanceof Error ? err.message : err)
    return { names: [] }
  }
})
