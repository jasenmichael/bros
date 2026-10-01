export default defineNuxtRouteMiddleware((to) => {
  if (to.path !== '/agent' && !to.path.startsWith('/agent/')) return
  const next = to.path.replace(/^\/agent/, '/chat') || '/chat'
  return navigateTo(next, { replace: true })
})
