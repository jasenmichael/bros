import { installSidecarWsProxy } from '../utils/sidecarProxy'

/** Attach httpxy WS upgrade on the Node server. Vite-dev HMR may not reach this. */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const socket = event.node?.req?.socket
    const server = socket && 'server' in socket ? socket.server : undefined
    if (server && typeof server.on === 'function') {
      installSidecarWsProxy(server)
    }
  })
})
