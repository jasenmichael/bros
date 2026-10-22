import { during } from './progress.mjs'

const env = 'export HOME=/home/bros/.nix XDG_DATA_HOME=/home/bros/.nix/devbox PATH="/home/bros/.nix/.nix-profile/bin:$PATH";'

function asNix(ctx, cmd) {
  return `su -s /bin/bash nix -c ${ctx.q(`${env} ${cmd}`)}`
}

function nixName(spec) {
  const hash = String(spec).indexOf('#')
  return hash >= 0 ? String(spec).slice(hash + 1) : String(spec)
}

function binDir(ctx) {
  const out = ctx.capture(`${asNix(ctx, 'devbox global shellenv 2>/dev/null')} | sed -n 's/.*PATH="\\([^:]*\\).*/\\1/p' | head -n 1`)
  return out.split('\n').map((line) => line.trim()).find((line) => line.startsWith('/')) || ''
}

function linkBins(ctx) {
  const dir = binDir(ctx)
  if (dir) ctx.sh(`dir=${ctx.q(dir)}; for b in "$dir"/*; do [ -e "$b" ] || continue; ln -sfn "$b" "/usr/local/bin/$(basename "$b")"; done`)
  ctx.sh('for b in /usr/local/bin/*; do [ -L "$b" ] || continue; t=$(readlink "$b"); case "$t" in /nix/store/*) [ -e "$b" ] || rm -f "$b" ;; esac; done')
}

export const nix = {
  kind: 'nix',
  apply(pkg, ctx) {
    return during(`${pkg.id}: install`, () => {
      const name = nixName(pkg.spec)
      if (!ctx.sh(asNix(ctx, `devbox global add ${ctx.q(name)}`))) return false
      linkBins(ctx)
      return true
    })
  },
  remove(pkg, ctx) {
    const name = nixName(pkg.spec)
    ctx.sh(asNix(ctx, `devbox global rm ${ctx.q(name)} || true`))
    linkBins(ctx)
  },
  present(pkg, ctx) {
    const name = nixName(pkg.spec)
    const out = ctx.capture(asNix(ctx, 'devbox global list 2>/dev/null || true'))
    return out.split('\n').some((line) => line.split(/\s+/).includes(name) || line.includes(`/${name}`))
  },
}
