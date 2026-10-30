import { during } from './progress.mjs'

function pkgName(spec) {
  if (spec.startsWith('@')) {
    const slash = spec.indexOf('/')
    const rest = spec.slice(slash + 1)
    return `@${spec.slice(1, slash)}/${rest.split('@')[0]}`
  }
  return spec.split('@')[0]
}

export const pnpm = {
  kind: 'pnpm',
  apply(pkg, ctx) {
    return during(`${pkg.id}: install`, () => ctx.sh(`pnpm add -g ${ctx.q(pkg.spec)}`))
  },
  remove(pkg, ctx) {
    ctx.sh(`pnpm remove -g ${ctx.q(pkgName(pkg.spec))}`)
  },
  present(pkg, ctx) {
    if (!pkg.bin) return false
    return ctx.exists('/home/bros/.local/share/pnpm', pkg.bin)
  },
}
