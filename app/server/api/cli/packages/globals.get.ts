import { listGlobalPackages } from '../../../utils/cli/globals'

export default defineEventHandler(async () => ({ kinds: await listGlobalPackages() }))
