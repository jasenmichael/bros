import { during } from './progress.mjs'

function splitSpec(spec) {
  const at = String(spec).lastIndexOf('@')
  if (at <= 0) return { name: String(spec), version: '' }
  return { name: String(spec).slice(0, at), version: String(spec).slice(at + 1) }
}

export const cargo = {
  kind: 'cargo',
  apply(pkg, ctx) {
    return during(`${pkg.id}: install`, () => {
      const { name, version } = splitSpec(pkg.spec)
      const ver = version ? ` --version ${ctx.q(version)}` : ''
      return ctx.sh(`cargo install --locked --root /home/bros/.cargo ${ctx.q(name)}${ver}`)
    })
  },
  remove(pkg, ctx) {
    const { name } = splitSpec(pkg.spec)
    ctx.sh(`cargo uninstall --root /home/bros/.cargo ${ctx.q(name)} || true`)
  },
  present(pkg, ctx) {
    const name = pkg.bin || splitSpec(pkg.spec).name
    if (!name) return false
    return ctx.sh(`command -v ${ctx.q(name)} >/dev/null`) || ctx.exists('/home/bros/.cargo/bin', name)
  },
}
