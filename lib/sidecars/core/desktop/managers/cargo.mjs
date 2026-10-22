import { during } from './progress.mjs'

function splitSpec(spec) {
  const at = String(spec).lastIndexOf('@')
  if (at <= 0) return { name: String(spec), version: '' }
  return { name: String(spec).slice(0, at), version: String(spec).slice(at + 1) }
}

function ensureRustup(ctx) {
  if (ctx.sh('command -v cargo >/dev/null && command -v rustc >/dev/null')) return true
  return ctx.sh("curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs | RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo sh -s -- -y --profile minimal --default-toolchain stable --no-modify-path && ln -sfn /usr/local/cargo/bin/cargo /usr/local/bin/cargo && ln -sfn /usr/local/cargo/bin/rustc /usr/local/bin/rustc && ln -sfn /usr/local/cargo/bin/rustup /usr/local/bin/rustup")
}

export const cargo = {
  kind: 'cargo',
  apply(pkg, ctx) {
    return during(`${pkg.id}: install`, () => {
      if (!ensureRustup(ctx)) return false
      const { name, version } = splitSpec(pkg.spec)
      const ver = version ? ` --version ${ctx.q(version)}` : ''
      return ctx.sh(`CARGO_HOME=/var/cache/bros/cargo CARGO_TARGET_DIR=/var/cache/bros/cargo-target RUSTUP_HOME=/usr/local/rustup cargo install --locked --root /usr/local ${ctx.q(name)}${ver}`)
    })
  },
  remove(pkg, ctx) {
    const { name } = splitSpec(pkg.spec)
    ctx.sh(`RUSTUP_HOME=/usr/local/rustup cargo uninstall --root /usr/local ${ctx.q(name)}`)
  },
  present(pkg, ctx) {
    const name = pkg.bin || splitSpec(pkg.spec).name
    if (!name) return false
    return ctx.exists('/usr/local/bin', name)
  },
}
