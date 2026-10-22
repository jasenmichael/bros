import { during } from './progress.mjs'

function toolName(spec) {
  const eq = String(spec).indexOf('==')
  return eq === -1 ? String(spec) : String(spec).slice(0, eq)
}

export const uv = {
  kind: 'uv',
  apply(pkg, ctx) {
    return during(`${pkg.id}: install`, () => ctx.sh(`uv tool install ${ctx.q(pkg.spec)}`))
  },
  remove(pkg, ctx) {
    ctx.sh(`uv tool uninstall ${ctx.q(toolName(pkg.spec))}`)
  },
  present(pkg, ctx) {
    const name = pkg.bin || toolName(pkg.spec)
    if (!name) return false
    return ctx.exists('/usr/local/bin', name) || ctx.exists('/home/bros/.local/bin', name)
  },
}
