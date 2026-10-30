import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadBootstrapConfig } from '../../../utils/config'
import { readCliPackages } from '../../../utils/cli/packages'
import { getDockerApp } from '../../../utils/docker-app/dockerApps'

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  if (!ID.test(id)) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const query = getQuery(event)
  const tail = Math.min(Math.max(Number(query.tail) || 200, 1), 2000)
  if (getDockerApp(id)) {
    const { dockerAppLogs } = await import('../../../utils/docker')
    return dockerAppLogs(id, tail)
  }
  const pkg = readCliPackages().find((row) => row.id === id)
  if (!pkg?.services?.length) throw createError({ statusCode: 404, statusMessage: 'App service not found' })
  const file = join(loadBootstrapConfig().dataDir, 'var', 'logs', 'apps', `${id}.log`)
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    text = ''
  }
  const logs = text.split('\n').slice(-tail).join('\n').trim()
  return { id, logs }
})
