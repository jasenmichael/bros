export default defineEventHandler(() => ({
  ok: true,
  service: 'bros',
  milestone: process.env.BROS_MILESTONE || 'dev'
}))
