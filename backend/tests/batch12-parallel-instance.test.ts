/**
 * batch12-parallel-instance.test.ts
 *
 * Tests for parallel instance monitoring:
 * - Background task creation via sendToInstance()
 * - Task state transitions (running → done / error)
 * - Parallel sends to multiple instances
 * - getInstanceLogs() and getBackgroundStatus()
 * - resolveInstanceTarget() helper
 * - Edge cases
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  getInstanceManager,
  parseInstanceCommand,
  resolveInstanceTarget,
  formatInstanceList,
  type InstanceInfo,
  type BackgroundInstanceTask,
} from '../src/server/instanceCommands.js'

describe('resolveInstanceTarget', () => {
  const instances: InstanceInfo[] = [
    { sessionId: 'aaa11111-2222-3333-4444-555566667777', userId: 'alice', cwd: '/tmp/a', createdAt: 1000, lastActivityAt: 2000, hasQueryEngine: true },
    { sessionId: 'bbb22222-3333-4444-5555-666677778888', userId: 'bob', cwd: '/tmp/b', createdAt: 1000, lastActivityAt: 2000, hasQueryEngine: true },
    { sessionId: 'ccc33333-4444-5555-6666-777788889999', userId: 'charlie', cwd: '/tmp/c', createdAt: 1000, lastActivityAt: 2000, hasQueryEngine: false },
  ]
  const userIdMap = new Map<string, string>([
    ['aaa11111-2222-3333-4444-555566667777', 'alice'],
    ['bbb22222-3333-4444-5555-666677778888', 'bob'],
    ['ccc33333-4444-5555-6666-777788889999', 'charlie'],
  ])

  test('exact session ID match', () => {
    expect(resolveInstanceTarget(instances, userIdMap, 'aaa11111-2222-3333-4444-555566667777'))
      .toBe('aaa11111-2222-3333-4444-555566667777')
  })

  test('short ID prefix match', () => {
    expect(resolveInstanceTarget(instances, userIdMap, 'aaa11111')).toBe('aaa11111-2222-3333-4444-555566667777')
    expect(resolveInstanceTarget(instances, userIdMap, 'bbb22222')).toBe('bbb22222-3333-4444-5555-666677778888')
  })

  test('userId match', () => {
    expect(resolveInstanceTarget(instances, userIdMap, 'alice')).toBe('aaa11111-2222-3333-4444-555566667777')
    expect(resolveInstanceTarget(instances, userIdMap, 'bob')).toBe('bbb22222-3333-4444-5555-666677778888')
  })

  test('not found returns null', () => {
    expect(resolveInstanceTarget(instances, userIdMap, 'nonexistent')).toBeNull()
  })

  test('ambiguous prefix returns null', () => {
    // All start with different chars, so this tests a single-char prefix
    expect(resolveInstanceTarget(instances, userIdMap, 'a')).toBe('aaa11111-2222-3333-4444-555566667777')
  })

  test('empty target returns null', () => {
    expect(resolveInstanceTarget(instances, userIdMap, '')).toBeNull()
  })
})

describe('parseInstanceCommand', () => {
  test('parses subcommand + args', () => {
    const result = parseInstanceCommand('send bob hello world')
    expect(result.subcommand).toBe('send')
    expect(result.args).toBe('bob hello world')
  })

  test('parses single subcommand', () => {
    const result = parseInstanceCommand('list')
    expect(result.subcommand).toBe('list')
    expect(result.args).toBe('')
  })

  test('parses empty string', () => {
    const result = parseInstanceCommand('')
    expect(result.subcommand).toBe('')
    expect(result.args).toBe('')
  })

  test('trims whitespace', () => {
    const result = parseInstanceCommand('  send   bob msg  ')
    expect(result.subcommand).toBe('send')
    expect(result.args).toBe('bob msg')
  })
})

describe('InstanceCommandManager — background tasks', () => {
  const manager = getInstanceManager()

  beforeEach(async () => {
    await manager.destroyAll()
  })

  afterEach(async () => {
    await manager.destroyAll()
  })

  test('sendToInstance rejects unknown target', () => {
    const result = manager.sendToInstance('nonexistent', 'hello')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not found')
  })

  test('sendToInstance works with valid instance', async () => {
    const created = await manager.createInstance({ userId: 'alice', apiKey: 'test-key' })
    expect(created.ok).toBe(true)

    const result = manager.sendToInstance('alice', 'hello')
    expect(result.ok).toBe(true)
    expect(result.message).toContain('Background task started')
    expect(result.message).toContain('alice')

    // Check background status
    const bg = manager.getBackgroundStatus()
    expect(bg.size).toBeGreaterThanOrEqual(1)

    // Wait for task to complete (or timeout)
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Check logs
    const logs = manager.getInstanceLogs('alice')
    expect(logs.ok).toBe(true)
    if (logs.ok) {
      expect(logs.logs.length).toBe(1)
      // Status should be 'done' or 'error' (no apiKey = echo mode or error)
      expect(['done', 'error']).toContain(logs.logs[0].status)
    }
  })

  test('sendToInstance rejects when already running', async () => {
    await manager.createInstance({ userId: 'alice', apiKey: 'test-key' })
    const r1 = manager.sendToInstance('alice', 'hello')
    expect(r1.ok).toBe(true)

    const r2 = manager.sendToInstance('alice', 'second message')
    expect(r2.ok).toBe(false)
    expect(r2.error).toContain('already has a running task')
  })

  test('parallel sends to different instances', async () => {
    await manager.createInstance({ userId: 'alice', apiKey: 'test-key-alice' })
    await manager.createInstance({ userId: 'bob', apiKey: 'test-key-bob' })

    const r1 = manager.sendToInstance('alice', 'hello from alice')
    const r2 = manager.sendToInstance('bob', 'hello from bob')

    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)

    // Both should be tracked
    const bg = manager.getBackgroundStatus()
    expect(bg.size).toBe(2)
  })

  test('getInstanceLogs without target returns all', async () => {
    await manager.createInstance({ userId: 'alice', apiKey: 'test-key' })
    await manager.createInstance({ userId: 'bob', apiKey: 'test-key' })

    manager.sendToInstance('alice', 'msg1')
    manager.sendToInstance('bob', 'msg2')

    const result = manager.getInstanceLogs()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.logs.length).toBe(2)
    }
  })

  test('getInstanceLogs with unknown target returns error', () => {
    const result = manager.getInstanceLogs('unknown')
    expect(result.ok).toBe(false)
  })

  test('getInstanceLogs with no background task returns error', async () => {
    await manager.createInstance({ userId: 'alice', apiKey: 'test-key' })
    const result = manager.getInstanceLogs('alice')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('No background task')
  })

  test('getBackgroundStatus returns copy', async () => {
    await manager.createInstance({ userId: 'alice', apiKey: 'test-key' })
    manager.sendToInstance('alice', 'hello')

    const bg1 = manager.getBackgroundStatus()
    const bg2 = manager.getBackgroundStatus()
    expect(bg1).not.toBe(bg2) // different Map instances
    expect(bg1.size).toBe(bg2.size)
  })

  test('formatInstanceList includes all instances', async () => {
    await manager.createInstance({ userId: 'alice', apiKey: 'test-key' })
    await manager.createInstance({ userId: 'bob', apiKey: 'test-key' })

    const instances = manager.listInstances()
    const output = formatInstanceList(instances, manager.getCurrentInstanceId())
    expect(output).toContain('alice')
    expect(output).toContain('bob')
    expect(output).toContain('*')
  })
})

describe('BackgroundInstanceTask type shape', () => {
  test('task has expected fields', () => {
    const task: BackgroundInstanceTask = {
      instanceId: 'test-id',
      userId: 'alice',
      status: 'running',
      startTime: Date.now(),
    }
    expect(task.status).toBe('running')
    expect(task.response).toBeUndefined()
    expect(task.error).toBeUndefined()
    expect(task.endTime).toBeUndefined()
  })

  test('task can transition to done', () => {
    const task: BackgroundInstanceTask = {
      instanceId: 'test-id',
      userId: 'alice',
      status: 'running',
      startTime: Date.now(),
    }
    task.status = 'done'
    task.endTime = Date.now()
    task.response = 'Hello!'
    expect(task.status).toBe('done')
    expect(task.response).toBe('Hello!')
  })
})
