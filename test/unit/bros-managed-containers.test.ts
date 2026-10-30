import { describe, expect, it } from 'vitest'
import {
  containerNameConflict,
  isBrosManagedContainer,
  toBrosManagedContainer,
  type BrosContainerListItem,
} from '../../src/server/utils/docker'

function item(partial: BrosContainerListItem): BrosContainerListItem {
  return partial
}

describe('Bros-managed Docker inventory', () => {
  it('reads a compose container-name conflict', () => {
    const text = 'Error response from daemon: Conflict. The container name "/bros-cursor-cursor-1" is already in use by container "029be4c5ca63".'
    expect(containerNameConflict(text)).toBe('bros-cursor-cursor-1')
    expect(containerNameConflict('nope')).toBeNull()
  })

  it('keeps the app container and every bros-* compose service', () => {
    const app = item({
      Id: '1',
      Names: ['/bros'],
      State: 'running',
      Status: 'Up 2 hours',
      Image: 'bros:latest',
      Labels: {
        'com.docker.compose.project': 'bros',
        'com.docker.compose.service': 'bros',
      },
      Ports: [{ PublicPort: 3055 }],
    })
    const redis = item({
      Id: '2',
      Names: ['/bros-firecrawl-redis-1'],
      State: 'exited',
      Status: 'Exited (0) 3 minutes ago',
      Image: 'redis:alpine',
      Labels: {
        'com.docker.compose.project': 'bros-firecrawl',
        'com.docker.compose.service': 'redis',
      },
      Ports: [],
    })
    const other = item({
      Id: '3',
      Names: ['/unrelated'],
      State: 'running',
      Image: 'nginx',
      Labels: { 'com.docker.compose.project': 'other' },
    })

    expect(isBrosManagedContainer(app)).toBe(true)
    expect(isBrosManagedContainer(redis)).toBe(true)
    expect(isBrosManagedContainer(other)).toBe(false)

    const mappedApp = toBrosManagedContainer(app)
    expect(mappedApp).toMatchObject({
      kind: 'app',
      dockerAppId: null,
      service: 'bros',
      running: true,
      ports: [3055],
    })

    const mappedRedis = toBrosManagedContainer(redis)
    expect(mappedRedis).toMatchObject({
      kind: 'docker',
      dockerAppId: 'firecrawl',
      service: 'redis',
      running: false,
      state: 'exited',
    })
  })

  it('keeps a Bros app container even when the compose project is not named bros', () => {
    const row = item({
      Id: 'dev',
      Names: ['/myfork-bros-1'],
      State: 'running',
      Image: 'bros:dev',
      Labels: {
        'com.docker.compose.project': 'myfork',
        'com.docker.compose.service': 'bros',
      },
      Ports: [{ PublicPort: 3055 }],
    })
    expect(isBrosManagedContainer(row)).toBe(true)
    expect(toBrosManagedContainer(row).kind).toBe('app')
  })
})
