import { apt } from './apt.ts'
import { bun } from './bun.ts'
import { cargo } from './cargo.ts'
import { deb } from './deb.ts'
import { deno } from './deno.ts'
import { nix } from './nix.ts'
import { npm } from './npm.ts'
import { pnpm } from './pnpm.ts'
import { run } from './run.ts'
import { uv } from './uv.ts'

export const managers = Object.fromEntries([npm, pnpm, bun, deno, uv, cargo, nix, apt, deb, run].map((manager) => [manager.kind, manager]))
