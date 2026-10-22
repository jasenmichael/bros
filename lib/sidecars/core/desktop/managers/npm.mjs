import { during } from './progress.mjs'

function npmName(spec) {
  if (spec.startsWith('@')) {
    const slash = spec.indexOf('/')
    const rest = spec.slice(slash + 1)
    return `@${spec.slice(1, slash)}/${rest.split('@')[0]}`
  }
  return spec.split('@')[0]
}

export const npm = {
  kind: 'npm',
  apply(pkg, ctx) {
    const tail = ctx.flags(pkg)
    return during(`${pkg.id}: install`, () => ctx.sh(`npm install -g --prefix ${ctx.q(ctx.npmPrefix)} ${ctx.q(pkg.spec)}${tail}`))
  },
  remove(pkg, ctx) {
    for (const prefix of ctx.npmPrefixes) ctx.sh(`npm uninstall -g --prefix ${ctx.q(prefix)} ${ctx.q(npmName(pkg.spec))}`)
  },
  present(pkg, ctx) {
    if (!pkg.bin) return false
    return ctx.npmPrefixes.some((prefix) => ctx.exists(prefix, 'bin', pkg.bin))
  },
}
