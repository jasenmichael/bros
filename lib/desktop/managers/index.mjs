import { apt } from './apt.mjs'
import { bun } from './bun.mjs'
import { cargo } from './cargo.mjs'
import { deb } from './deb.mjs'
import { deno } from './deno.mjs'
import { nix } from './nix.mjs'
import { npm } from './npm.mjs'
import { pnpm } from './pnpm.mjs'
import { run } from './run.mjs'
import { uv } from './uv.mjs'

export const managers = Object.fromEntries([npm, pnpm, bun, deno, uv, cargo, nix, apt, deb, run].map((manager) => [manager.kind, manager]))
