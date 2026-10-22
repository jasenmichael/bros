import { apt } from './apt.mjs'
import { bun } from './bun.mjs'
import { deb } from './deb.mjs'
import { deno } from './deno.mjs'
import { nix } from './nix.mjs'
import { npm } from './npm.mjs'
import { pnpm } from './pnpm.mjs'
import { run } from './run.mjs'

export const managers = Object.fromEntries([npm, pnpm, bun, deno, nix, apt, deb, run].map((manager) => [manager.kind, manager]))
