import { rotateProxyKey } from '../../utils/auth'

export default defineEventHandler(() => {
  return { proxyKey: rotateProxyKey() }
})
