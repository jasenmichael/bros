import { ensureStandingPull } from '../../../utils/agents/github'
import { addAgentProject, readSettings, setProjectPromotion } from '../../../utils/agents/store'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ fullName?: string, defaultBranch?: string, path?: string }>(event)
  let row
  try {
    row = addAgentProject({
      fullName: body?.fullName || '',
      defaultBranch: body?.defaultBranch,
      path: body?.path,
    })
  }
  catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'bad project' })
  }
  const token = readSettings().githubToken
  const fullName = row.fullName || ''
  const slash = fullName.indexOf('/')
  if (token && row.prBase === 'staging' && slash > 0) {
    const standing = await ensureStandingPull(token, fullName.slice(0, slash), fullName.slice(slash + 1), 'staging').catch(() => null)
    if (standing?.url) {
      setProjectPromotion(row.name, standing.url)
      row = { ...row, promotionUrl: standing.url }
    }
  }
  return row
})
