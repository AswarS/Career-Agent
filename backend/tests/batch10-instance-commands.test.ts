/**
 * batch10-instance-commands.test.ts — Tests for terminal /instance command system
 *
 * Covers:
 *   - InstanceCommandManager: create, list, switch, close, info
 *   - parseInstanceCommand: subcommand parsing
 *   - formatInstanceList: output formatting
 *   - Instance isolation: separate STATE per instance
 *   - Short ID resolution
 *   - Edge cases: non-existent IDs, empty lists, current instance tracking
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  InstanceCommandManager,
  getInstanceManager,
  parseInstanceCommand,
  formatInstanceList,
  type InstanceInfo,
  type CreateInstanceOptions,
} from '../src/server/instanceCommands.js'
import { getSessionContext, runWithSessionContext, isServerMode } from '../src/server/SessionContext.js'

// ---------------------------------------------------------------------------
// parseInstanceCommand
// ---------------------------------------------------------------------------

describe('parseInstanceCommand', () => {
  test('parses subcommand without args', () => {
    const result = parseInstanceCommand('list')
    expect(result.subcommand).toBe('list')
    expect(result.args).toBe('')
  })

  test('parses subcommand with args', () => {
    const result = parseInstanceCommand('switch abc123')
    expect(result.subcommand).toBe('switch')
    expect(result.args).toBe('abc123')
  })

  test('parses complex args', () => {
    const result = parseInstanceCommand('new userId=alice apiKey=sk-test')
    expect(result.subcommand).toBe('new')
    expect(result.args).toBe('userId=alice apiKey=sk-test')
  })

  test('handles empty input', () => {
    const result = parseInstanceCommand('')
    expect(result.subcommand).toBe('')
    expect(result.args).toBe('')
  })

  test('handles whitespace-only input', () => {
    const result = parseInstanceCommand('   ')
    expect(result.subcommand).toBe('')
    expect(result.args).toBe('')
  })
})

// ---------------------------------------------------------------------------
// formatInstanceList
// ---------------------------------------------------------------------------

describe('formatInstanceList', () => {
  test('shows message for empty list', () => {
    const output = formatInstanceList([], null)
    expect(output).toContain('No active instances')
  })

  test('formats single instance', () => {
    const instances: InstanceInfo[] = [{
      sessionId: 'abcdefgh-1234-5678-9abc-def012345678',
      userId: 'alice',
      cwd: '/home/alice/project',
      createdAt: Date.now() - 60000,
      lastActivityAt: Date.now(),
      hasQueryEngine: true,
    }]
    const output = formatInstanceList(instances, instances[0].sessionId)
    expect(output).toContain('abcdefgh')
    expect(output).toContain('alice')
    expect(output).toContain('/home/alice/project')
    expect(output).toContain('*') // current marker
  })

  test('formats multiple instances', () => {
    const instances: InstanceInfo[] = [
      {
        sessionId: 'aaa00000-0000-0000-0000-000000000000',
        userId: 'alice',
        cwd: '/home/alice',
        createdAt: Date.now() - 120000,
        lastActivityAt: Date.now(),
        hasQueryEngine: true,
      },
      {
        sessionId: 'bbb11111-0000-0000-0000-000000000000',
        userId: 'bob',
        cwd: '/home/bob',
        createdAt: Date.now() - 60000,
        lastActivityAt: Date.now(),
        hasQueryEngine: false,
      },
    ]
    const output = formatInstanceList(instances, instances[0].sessionId)
    expect(output).toContain('aaa00000')
    expect(output).toContain('bbb11111')
    expect(output).toContain('alice')
    expect(output).toContain('bob')
  })
})

// ---------------------------------------------------------------------------
// InstanceCommandManager
// ---------------------------------------------------------------------------

describe('InstanceCommandManager', () => {
  let manager: InstanceCommandManager

  beforeEach(() => {
    manager = new InstanceCommandManager()
  })

  afterEach(async () => {
    await manager.destroyAll()
  })

  // --- Create ---

  test('createInstance creates an instance with userId', async () => {
    const result = await manager.createInstance({
      userId: 'test-user',
      apiKey: 'sk-test-key',
    })
    expect(result.ok).toBe(true)
    expect(result.sessionId).toBeDefined()
    expect(result.message).toContain('test-user')
  })

  test('createInstance auto-switches to new instance', async () => {
    await manager.createInstance({ userId: 'alice', apiKey: 'sk-alice' })
    expect(manager.getCurrentInstanceId()).not.toBeNull()
  })

  test('createInstance with all options', async () => {
    const result = await manager.createInstance({
      userId: 'bob',
      apiKey: 'sk-bob',
      baseUrl: 'https://custom-api.example.com',
      cwd: '/tmp/bob-workspace',
    })
    expect(result.ok).toBe(true)
  })

  test('createInstance without apiKey still works', async () => {
    const result = await manager.createInstance({ userId: 'no-key-user' })
    expect(result.ok).toBe(true)
  })

  // --- List ---

  test('listInstances returns empty for fresh manager', () => {
    const list = manager.listInstances()
    expect(list).toHaveLength(0)
  })

  test('listInstances returns created instances', async () => {
    await manager.createInstance({ userId: 'alice', apiKey: 'sk-alice' })
    await manager.createInstance({ userId: 'bob', apiKey: 'sk-bob' })

    const list = manager.listInstances()
    expect(list).toHaveLength(2)

    const userIds = list.map(i => i.userId).sort()
    expect(userIds).toEqual(['alice', 'bob'])
  })

  // --- Switch ---

  test('switchInstance switches to existing instance', async () => {
    const r1 = await manager.createInstance({ userId: 'alice', apiKey: 'sk-alice' })
    const r2 = await manager.createInstance({ userId: 'bob', apiKey: 'sk-bob' })

    // Currently on bob (last created)
    expect(manager.getCurrentInstanceId()).toBe(r2.sessionId)

    // Switch to alice
    const result = manager.switchInstance(r1.sessionId!)
    expect(result.ok).toBe(true)
    expect(manager.getCurrentInstanceId()).toBe(r1.sessionId)
  })

  test('switchInstance fails for non-existent ID', () => {
    const result = manager.switchInstance('non-existent-id')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not found')
  })

  // --- Close ---

  test('closeInstance destroys the instance', async () => {
    const r = await manager.createInstance({ userId: 'alice', apiKey: 'sk-alice' })
    const sessionId = r.sessionId!

    const result = await manager.closeInstance(sessionId)
    expect(result.ok).toBe(true)
    expect(result.message).toContain('closed')

    const list = manager.listInstances()
    expect(list).toHaveLength(0)
  })

  test('closeInstance clears currentInstanceId if closing current', async () => {
    const r = await manager.createInstance({ userId: 'alice', apiKey: 'sk-alice' })
    expect(manager.getCurrentInstanceId()).toBe(r.sessionId)

    await manager.closeInstance(r.sessionId!)
    expect(manager.getCurrentInstanceId()).toBeNull()
  })

  test('closeInstance fails for non-existent ID', async () => {
    const result = await manager.closeInstance('non-existent')
    expect(result.ok).toBe(false)
  })

  // --- Info ---

  test('getCurrentInfo shows no instance when none active', () => {
    const result = manager.getCurrentInfo()
    expect(result.ok).toBe(true)
    expect(result.message).toContain('No active instance')
  })

  test('getCurrentInfo shows current instance details', async () => {
    const r = await manager.createInstance({ userId: 'alice', apiKey: 'sk-alice' })
    const result = manager.getCurrentInfo()
    expect(result.ok).toBe(true)
    expect(result.message).toContain('alice')
    expect(result.sessionId).toBe(r.sessionId)
  })

  // --- hasInstances ---

  test('hasInstances is false initially', () => {
    expect(manager.hasInstances()).toBe(false)
  })

  test('hasInstances is true after creating instance', async () => {
    await manager.createInstance({ userId: 'test', apiKey: 'sk-test' })
    expect(manager.hasInstances()).toBe(true)
  })

  // --- getCurrentContext ---

  test('getCurrentContext returns null when no instance active', () => {
    expect(manager.getCurrentContext()).toBeNull()
  })

  test('getCurrentContext returns context after create', async () => {
    await manager.createInstance({ userId: 'alice', apiKey: 'sk-alice' })
    const ctx = manager.getCurrentContext()
    expect(ctx).not.toBeNull()
    expect(ctx!.config.apiKey).toBe('sk-alice')
  })

  // --- destroyAll ---

  test('destroyAll cleans up all instances', async () => {
    await manager.createInstance({ userId: 'a', apiKey: 'sk-a' })
    await manager.createInstance({ userId: 'b', apiKey: 'sk-b' })

    const count = await manager.destroyAll()
    expect(count).toBe(2)
    expect(manager.listInstances()).toHaveLength(0)
    expect(manager.getCurrentInstanceId()).toBeNull()
  })

  // --- Multi-instance isolation ---

  test('instances have different sessionIds', async () => {
    const r1 = await manager.createInstance({ userId: 'alice', apiKey: 'sk-a' })
    const r2 = await manager.createInstance({ userId: 'bob', apiKey: 'sk-b' })
    expect(r1.sessionId).not.toBe(r2.sessionId)
  })

  test('instances have independent contexts', async () => {
    const r1 = await manager.createInstance({ userId: 'alice', apiKey: 'sk-alice', cwd: '/tmp/a' })
    const r2 = await manager.createInstance({ userId: 'bob', apiKey: 'sk-bob', cwd: '/tmp/b' })

    // Switch to alice and check context
    manager.switchInstance(r1.sessionId!)
    const ctx1 = manager.getCurrentContext()
    expect(ctx1!.config.apiKey).toBe('sk-alice')

    // Switch to bob and check context
    manager.switchInstance(r2.sessionId!)
    const ctx2 = manager.getCurrentContext()
    expect(ctx2!.config.apiKey).toBe('sk-bob')
  })

  test('closing one instance does not affect others', async () => {
    const r1 = await manager.createInstance({ userId: 'alice', apiKey: 'sk-a' })
    const r2 = await manager.createInstance({ userId: 'bob', apiKey: 'sk-b' })

    await manager.closeInstance(r1.sessionId!)

    // bob should still be there
    const list = manager.listInstances()
    expect(list).toHaveLength(1)
    expect(list[0].userId).toBe('bob')
  })
})

// ---------------------------------------------------------------------------
// Singleton getInstanceManager
// ---------------------------------------------------------------------------

describe('getInstanceManager', () => {
  test('returns same instance on repeated calls', () => {
    const m1 = getInstanceManager()
    const m2 = getInstanceManager()
    expect(m1).toBe(m2)
  })
})

// ---------------------------------------------------------------------------
// ALS isolation verification
// ---------------------------------------------------------------------------

describe('Instance ALS isolation', () => {
  let manager: InstanceCommandManager

  beforeEach(() => {
    manager = new InstanceCommandManager()
  })

  afterEach(async () => {
    await manager.destroyAll()
  })

  test('runWithSessionContext binds instance context', async () => {
    await manager.createInstance({ userId: 'alice', apiKey: 'sk-alice' })

    const ctx = manager.getCurrentContext()
    expect(ctx).not.toBeNull()

    let insideContext = false
    runWithSessionContext(ctx!, () => {
      insideContext = isServerMode()
    })
    expect(insideContext).toBe(true)
  })

  test('different instances have different sessionIds in context', async () => {
    const r1 = await manager.createInstance({ userId: 'alice', apiKey: 'sk-a' })
    const r2 = await manager.createInstance({ userId: 'bob', apiKey: 'sk-b' })

    const ctx1 = manager.getSessionManager().getSession(r1.sessionId!)!.context
    const ctx2 = manager.getSessionManager().getSession(r2.sessionId!)!.context

    expect(ctx1.sessionId).not.toBe(ctx2.sessionId)
  })
})
