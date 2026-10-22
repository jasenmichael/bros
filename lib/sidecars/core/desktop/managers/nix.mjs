import { during } from './progress.mjs'

const env = 'export HOME=/opt/bros/nix-home XDG_DATA_HOME=/opt/bros/devbox;'

function nixName(spec) {
  const hash = String(spec).indexOf('#')
  return hash >= 0 ? String(spec).slice(hash + 1) : String(spec)
}

function binDir(ctx) {
  const out = ctx.capture(`${env} devbox global shellenv 2>/dev/null | sed -n 's/.*PATH="\\([^:]*\\).*/\\1/p' | head -n 1`)
  return out.split('\n').map((line) => line.trim()).find((line) => line.startsWith('/')) || ''
}

function linkBins(ctx) {
  const dir = binDir(ctx)
  if (dir) ctx.sh(`dir=${ctx.q(dir)}; for b in "$dir"/*; do [ -e "$b" ] || continue; ln -sfn "$b" "/usr/local/bin/$(basename "$b")"; done`)
  ctx.sh('for b in /usr/local/bin/*; do [ -L "$b" ] || continue; t=$(readlink "$b"); case "$t" in /nix/store/*) [ -e "$b" ] || rm -f "$b" ;; esac; done')
}

function loadCache(ctx) {
  if (!ctx.imageInstall) return
  ctx.sh(`${env} if ls /var/cache/bros/nix/*.narinfo >/dev/null 2>&1; then nix copy --from file:///var/cache/bros/nix --no-check-sigs --all || true; fi`)
}

function saveCache(ctx) {
  if (!ctx.imageInstall) return true
  const dir = binDir(ctx)
  if (!dir) return false
  const profile = dir.endsWith('/bin') ? dir.slice(0, -4) : dir
  return ctx.sh(`${env} profile=$(readlink -f ${ctx.q(profile)}); nix copy --to file:///var/cache/bros/nix "$profile"`)
}

export const nix = {
  kind: 'nix',
  apply(pkg, ctx) {
    return during(`${pkg.id}: install`, () => {
      loadCache(ctx)
      const name = nixName(pkg.spec)
      const ok = ctx.sh(`${env} devbox global add ${ctx.q(name)}`)
      if (!ok) return false
      linkBins(ctx)
      return saveCache(ctx)
    })
  },
  remove(pkg, ctx) {
    const name = nixName(pkg.spec)
    ctx.sh(`${env} devbox global rm ${ctx.q(name)} || true`)
    linkBins(ctx)
  },
  present(pkg, ctx) {
    const name = nixName(pkg.spec)
    const out = ctx.capture(`${env} devbox global list 2>/dev/null || true`)
    return out.split('\n').some((line) => line.split(/\s+/).includes(name) || line.includes(`/${name}`))
  },
}
