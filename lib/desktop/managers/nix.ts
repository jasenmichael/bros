import { during } from './progress.ts'

function nixName(spec) {
  const hash = String(spec).indexOf('#')
  return hash >= 0 ? String(spec).slice(hash + 1) : String(spec)
}

function binsOf(pkg) {
  const names = []
  for (const part of [...(pkg.clis || []), pkg.bin].filter(Boolean)) {
    for (const name of String(part).split(',')) {
      const bin = name.trim()
      if (bin && !names.includes(bin)) names.push(bin)
    }
  }
  return names
}

function asUser(ctx, cmd) {
  const env = `export HOME=/home/bros XDG_DATA_HOME=/home/bros/.local/share XDG_STATE_HOME=/home/bros/.local/state XDG_CACHE_HOME=/home/bros/.cache XDG_CONFIG_HOME=/home/bros/.config; eval "$(devbox global shellenv --init-hook 2>/dev/null)" || true;`
  const inner = `${env} ${cmd}`
  return `if id abc >/dev/null 2>&1; then runuser -u abc -- bash -lc ${ctx.q(inner)}; else bash -lc ${ctx.q(inner)}; fi`
}

function nodeSpec() {
  const pin = String(process.env.BROS_NODE_VERSION || '26.7.0').replace(/^v/, '') || '26.7.0'
  return { pin, spec: `nodejs@${pin}`, major: `nodejs@${pin.split('.')[0]}` }
}

export const nix = {
  kind: 'nix',
  apply(pkg, ctx) {
    return during(`${pkg.id}: install`, () => {
      let spec = nixName(pkg.spec)
      let fallback = ''
      if (pkg.id === 'node') {
        const node = nodeSpec()
        spec = node.spec
        fallback = node.major
      }
      if (ctx.sh(asUser(ctx, `devbox global add ${ctx.q(spec)}`))) return true
      return fallback ? ctx.sh(asUser(ctx, `devbox global add ${ctx.q(fallback)}`)) : false
    })
  },
  remove(pkg, ctx) {
    const name = nixName(pkg.spec).split('@')[0]
    ctx.sh(asUser(ctx, `devbox global rm ${ctx.q(name)} || true`))
  },
  present(pkg, ctx) {
    const bins = binsOf(pkg)
    if (bins.length) return bins.every((bin) => ctx.sh(`p=$(command -v ${ctx.q(bin)}) && test -x "$p"`))
    const name = nixName(pkg.spec).split('@')[0]
    const out = ctx.capture(asUser(ctx, 'devbox global list 2>/dev/null || true'))
    return out.split('\n').some((line) => line.split(/\s+/).includes(name) || line.includes(`/${name}`))
  },
}
