#!/bin/bash
# Print gap words and exit 1 until Selkies, ttyd, XWayland, and labwc answer.
exec node --input-type=module << 'EOF'
import net from 'node:net'
import fs from 'node:fs'

function tcp(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = (ok) => { socket.destroy(); resolve(ok) }
    socket.setTimeout(2000)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

function sock(path) {
  try { return fs.statSync(path).isSocket() } catch { return false }
}

const gaps = []
if (!await tcp(3000)) gaps.push('selkies')
if (!await tcp(7681)) gaps.push('ttyd')
if (!sock('/tmp/.X11-unix/X0')) gaps.push('x11')
if (!sock('/home/bros/.XDG/wayland-0')) gaps.push('wayland')
process.stdout.write(gaps.join(' '))
process.exit(gaps.length ? 1 : 0)
EOF
