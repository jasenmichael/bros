import { pullDockerAppRepo } from '../../../utils/docker-app/dockerApps'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  return pullDockerAppRepo(id)
})
