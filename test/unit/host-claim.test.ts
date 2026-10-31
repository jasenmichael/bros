import { chmodSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { claimForHost } from '../../app/server/utils/hostClaim'

describe('claimForHost', () => {
  let root = ''
  const savedUid = process.env.BROS_HOST_UID
  const savedGid = process.env.BROS_HOST_GID

  afterEach(() => {
    if (savedUid === undefined) delete process.env.BROS_HOST_UID
    else process.env.BROS_HOST_UID = savedUid
    if (savedGid === undefined) delete process.env.BROS_HOST_GID
    else process.env.BROS_HOST_GID = savedGid
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('no-ops when not root or env unset', () => {
    root = mkdtempSync(join(tmpdir(), 'bros-claim-'))
    const path = join(root, 'passkey')
    writeFileSync(path, 'x\n', { mode: 0o600 })
    delete process.env.BROS_HOST_UID
    delete process.env.BROS_HOST_GID
    claimForHost(path)
    expect(statSync(path).isFile()).toBe(true)
  })
})
