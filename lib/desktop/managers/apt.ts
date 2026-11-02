import { during } from './progress.ts'

function isRoot() {
  return typeof process.getuid === 'function' && process.getuid() === 0
}

function aptCmd(args) {
  const cmd = `env DEBIAN_FRONTEND=noninteractive apt-get ${args}`
  return isRoot() ? cmd : `sudo -n ${cmd}`
}

export const apt = {
  kind: 'apt',
  apply(pkg, ctx) {
    if (!ctx.aptUpdated) {
      if (!during(`${pkg.id}: apt update`, () => ctx.sh(aptCmd('update')))) return false
      ctx.aptUpdated = true
    }
    return during(`${pkg.id}: install`, () => ctx.sh(aptCmd(`install -y ${ctx.q(pkg.spec)}`)))
  },
  remove(pkg, ctx) {
    ctx.sh(aptCmd(`remove -y ${ctx.q(pkg.spec)}`))
  },
  present(pkg, ctx) {
    return ctx.dpkg(pkg.spec)
  },
}
