import { readSkill } from '../../utils/skills'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const pack = readSkill(id)
  if (!pack || pack.readOnly) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    body: pack.body,
  }
})
