import { readSkill, writeUserSkill, writeUserSkillBody } from '../../utils/skills'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const body = await readBody<{ markdown?: string; body?: string }>(event)
  if (typeof body?.body === 'string') writeUserSkillBody(id, body.body)
  else if (typeof body?.markdown === 'string' && body.markdown.trim()) writeUserSkill(id, body.markdown)
  else throw createError({ statusCode: 400, statusMessage: 'markdown required' })
  const pack = readSkill(id)
  if (!pack) throw createError({ statusCode: 500, statusMessage: 'skill missing after write' })
  return pack
})
