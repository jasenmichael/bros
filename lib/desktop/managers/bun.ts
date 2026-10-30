import { during } from './progress.ts'

function pkgName(spec) {
  if (spec.startsWith('@')) {
    const slash = spec.indexOf('/')
    const rest = spec.slice(slash + 1)
    return `@${spec.slice(1, slash)}/${rest.split('@')[0]}`
  }
  return spec.split('@')[0]
}

export const bun = {
  kind: 'bun',
  apply(pkg, ctx) {
    return during(`${pkg.id}: install`, () => ctx.sh(`bun install -g ${ctx.q(pkg.spec)}`))
  },
  remove(pkg, ctx) {
    ctx.sh(`bun uninstall -g ${ctx.q(pkgName(pkg.spec))}`)
  },
  present(pkg, ctx) {
    if (!pkg.bin) return false
    return ctx.exists('/home/bros/.bun/bin', pkg.bin)
  },
}
