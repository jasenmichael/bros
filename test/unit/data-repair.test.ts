import { afterEach, describe, expect, it } from 'vitest'
import { dataRepairPlan } from '../../src/server/utils/repairData'

const KEYS = ['BROS_HOST_UID', 'BROS_HOST_GID', 'BROS_DATA_DIR', 'BROS_DATA_DIR', 'BROS_DIR', 'BROS_DIR'] as const

describe('dataRepairPlan', () => {
  const saved: Record<string, string | undefined> = {}

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  function saveEnv() {
    for (const key of KEYS) saved[key] = process.env[key]
  }

  it('builds the chown command from BROS_HOST_UID and BROS_HOST_GID', () => {
    saveEnv()
    process.env.BROS_HOST_UID = '1000'
    process.env.BROS_HOST_GID = '1000'
    process.env.BROS_DATA_DIR = '/home/me/dev/bros/data'
    const plan = dataRepairPlan()
    expect(plan.hostUid).toBe('1000')
    expect(plan.hostGid).toBe('1000')
    expect(plan.command).toBe('docker run --rm --user 0 -v /home/me/dev/bros/data:/data alpine:3.20 chown -R 1000:1000 /data')
    expect(plan.argv).toEqual(['run', '--rm', '--user', '0', '-v', '/home/me/dev/bros/data:/data', 'alpine:3.20', 'chown', '-R', '1000:1000', '/data'])
  })

  it('returns no command when the uid is unset', () => {
    saveEnv()
    delete process.env.BROS_HOST_UID
    process.env.BROS_HOST_GID = '1000'
    process.env.BROS_DATA_DIR = '/home/me/dev/bros/data'
    expect(dataRepairPlan().command).toBe('')
  })
})
