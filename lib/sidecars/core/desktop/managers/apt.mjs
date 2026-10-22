import { during } from './progress.mjs'

export const apt = {
  kind: 'apt',
  apply(pkg, ctx) {
    if (!ctx.aptUpdated) {
      if (!during(`${pkg.id}: apt update`, () => ctx.sh('apt-get update'))) return false
      ctx.aptUpdated = true
    }
    return during(`${pkg.id}: install`, () => ctx.sh(`DEBIAN_FRONTEND=noninteractive apt-get install -y ${ctx.q(pkg.spec)}`))
  },
  remove(pkg, ctx) {
    ctx.sh(`DEBIAN_FRONTEND=noninteractive apt-get remove -y ${ctx.q(pkg.spec)}`)
  },
  present(pkg, ctx) {
    return ctx.dpkg(pkg.spec)
  },
}
