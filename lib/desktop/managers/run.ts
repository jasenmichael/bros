import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { during } from './progress.ts'

export function runCacheDir(root, id, spec, stamp) {
  const hash = createHash('sha256').update(`${spec}\n${stamp || ''}`).digest('hex')
  return join(root, 'run', id, hash)
}

function rebaseLinks(root, from, to) {
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      const st = lstatSync(path)
      if (st.isDirectory()) {
        walk(path)
        continue
      }
      if (!st.isSymbolicLink()) continue
      const target = readlinkSync(path)
      if (target !== from && !target.startsWith(`${from}/`)) continue
      unlinkSync(path)
      symlinkSync(to + target.slice(from.length), path)
    }
  }
  walk(root)
}

function copyTree(src, dest) {
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { recursive: true })
  rebaseLinks(dest, src, dest)
}

function linkBins(pkg, dest, ctx) {
  const bins = [pkg.bin, ...(pkg.clis || [])].filter(Boolean)
  for (const bin of bins) {
    const from = join(dest, '.local', 'bin', bin)
    if (!existsSync(from)) continue
    ctx.sh(`ln -sfn ${ctx.q(from)} ${ctx.q(`/usr/local/bin/${bin}`)}`)
  }
}

function runUninstall(pkg, ctx) {
  const value = typeof pkg.uninstall === 'string' ? pkg.uninstall.trim() : ''
  if (!value) return false
  const rel = !/\s/.test(value) && !value.startsWith('/') && !value.split('/').includes('..')
  if (rel && pkg.dir && ctx.exists(pkg.dir, value)) {
    ctx.sh(ctx.q(join(pkg.dir, value)))
    return true
  }
  ctx.sh(value)
  return true
}

export const run = {
  kind: 'run',
  apply(pkg, ctx) {
    if (!ctx.imageInstall) return during(`${pkg.id}: install`, () => ctx.sh(pkg.spec))
    const root = ctx.cacheRoot || '/var/cache/bros'
    const dir = runCacheDir(root, pkg.id, pkg.spec, pkg.force || '')
    const dest = join(ctx.pkgRoot || '/opt/bros/pkg', pkg.id)
    const bin = pkg.bin ? join(dir, '.local', 'bin', pkg.bin) : ''
    if (bin && existsSync(bin)) {
      copyTree(dir, dest)
      linkBins(pkg, dest, ctx)
      return true
    }
    mkdirSync(dir, { recursive: true })
    if (!during(`${pkg.id}: install`, () => ctx.sh(`export HOME=${ctx.q(dir)}; ${pkg.spec}`))) return false
    copyTree(dir, dest)
    linkBins(pkg, dest, ctx)
    return true
  },
  remove(pkg, ctx) {
    if (runUninstall(pkg, ctx)) return
    const bins = [pkg.bin, ...(pkg.clis || [])].filter(Boolean)
    if (!bins.length) return
    ctx.sh(`rm -f ${bins.flatMap((bin) => [
      ctx.q(`/usr/local/bin/${bin}`),
      ctx.q(`/opt/bros/pkg/${pkg.id}/.local/bin/${bin}`),
      ctx.q(`/home/bros/.local/bin/${bin}`),
      ...ctx.runHomes.map((home) => ctx.q(`${home}/.local/bin/${bin}`)),
    ]).join(' ')}`)
  },
  present(pkg, ctx) {
    if (!pkg.bin) return false
    if (ctx.imageInstall && ctx.exists('/usr/local/bin', pkg.bin)) return true
    return ctx.runHomes.some((home) => ctx.exists(home, '.local/bin', pkg.bin))
  },
}
