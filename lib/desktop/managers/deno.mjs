import { during } from './progress.mjs'

function binName(spec) {
  const bare = String(spec).slice(String(spec).indexOf(':') + 1)
  const slash = bare.lastIndexOf('/')
  const name = slash >= 0 ? bare.slice(slash + 1) : bare
  const at = name.indexOf('@')
  return at === -1 ? name : name.slice(0, at)
}

export const deno = {
  kind: 'deno',
  apply(pkg, ctx) {
    return during(`${pkg.id}: install`, () => ctx.sh(`deno install -g -A ${ctx.q(pkg.spec)}`))
  },
  remove(pkg, ctx) {
    ctx.sh(`deno uninstall -g ${ctx.q(pkg.bin || binName(pkg.spec))}`)
  },
  present(pkg, ctx) {
    const name = pkg.bin || binName(pkg.spec)
    if (!name) return false
    return ctx.exists('/home/bros/.deno/bin', name)
  },
}
