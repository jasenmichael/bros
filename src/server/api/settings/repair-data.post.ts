import { repairDataDir } from '../../utils/repairData'

export default defineEventHandler(async () => {
  try {
    await repairDataDir()
    return { ok: true }
  }
  catch (err) {
    throw createError({
      statusCode: 500,
      statusMessage: err instanceof Error ? err.message : 'Repair failed',
    })
  }
})