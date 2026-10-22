import { during } from './progress.mjs'

function nixName(spec) {
  const hash = String(spec).indexOf('#')
  return hash >= 0 ? String(spec).slice(hash + 1) : String(spec)
}

function linkBins(ctx) {
  ctx.shUser(`dir=$(devbox global shellenv 2>/dev/null | sed -n 's/.*PATH="\\([^:]*\\).*/\\1/p' | head -n 1); if [ -n "$dir" ]; then mkdir -p /home/bros/.local; ln -sfn "$dir" /home/bros/.local/devbox-bin; fi`)
}

export const nix = {
  kind: 'nix',
  apply(pkg, ctx) {
    return during(`${pkg.id}: install`, () => {
      if (!ctx.ensureDevbox()) return false
      const name = nixName(pkg.spec)
      const ok = ctx.shUser(`devbox global add ${ctx.q(name)}`)
      if (ok) linkBins(ctx)
      return ok
    })
  },
  remove(pkg, ctx) {
    const name = nixName(pkg.spec)
    ctx.shUser(`devbox global rm ${ctx.q(name)} || true`)
    ctx.sh(`if command -v nix >/dev/null; then . "$HOME/.nix-profile/etc/profile.d/nix.sh" 2>/dev/null; nix profile remove ${ctx.q(`nixpkgs#${name}`)} || nix profile remove ${ctx.q(pkg.spec)} || true; fi`)
  },
  present(pkg, ctx) {
    const name = nixName(pkg.spec)
    const out = ctx.captureUser('devbox global list 2>/dev/null || true')
    return out.split('\n').some((line) => line.split(/\s+/).includes(name) || line.includes(`/${name}`))
  },
}
