import { apt } from './apt'
import { bun } from './bun'
import { cargo } from './cargo'
import { deb } from './deb'
import { deno } from './deno'
import { nix } from './nix'
import { npm } from './npm'
import { pnpm } from './pnpm'
import { run } from './run'
import { uv } from './uv'
import type { ManagerForm, PackageManager } from './types'

const LIST: PackageManager[] = [npm, pnpm, bun, deno, uv, cargo, nix, apt, deb, run]

const BY_KIND = new Map(LIST.map((manager) => [manager.kind, manager]))

export function packageManagers(): PackageManager[] {
  return LIST
}

export function managerByKind(kind: string): PackageManager | undefined {
  return BY_KIND.get(kind)
}

export function managerForms(): ManagerForm[] {
  return LIST.map((manager) => ({
    kind: manager.kind,
    args: manager.args,
    suggest: typeof manager.suggest === 'function',
    specLabel: manager.specLabel,
    placeholder: manager.placeholder,
  }))
}
