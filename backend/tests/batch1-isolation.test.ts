/**
 * batch1-isolation.test.ts -- Tests for Batch 1 completed features
 *
 * Covers:
 *   1. createIsolatedState (1a)
 *   2. SessionContext ALS basics (1d)
 *   3. sessionSwitched per-session isolation (1c)
 *   4. getSessionId ALS routing (1e partial)
 *   5. CLI compatibility (no ALS context)
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  getSessionContext,
  runWithSessionContext,
  isServerMode,
} from '../src/server/SessionContext.js'
import {
  createIsolatedState,
  getSessionId,
  switchSession,
  onSessionSwitch,
  resetStateForTests,
} from '../src/bootstrap/state.js'
import type { SessionContext } from '../src/server/SessionContext.js'
import { createSignal } from '../src/utils/signal.js'
import type { SessionId } from '../src/types/ids.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionContext(
  sessionId: string,
  stateOverrides: Record<string, unknown> = {},
): SessionContext {
  const state = createIsolatedState({ ...stateOverrides, sessionId })
  return {
    sessionId,
    state,
    config: { cwd: state.cwd ?? '/test' },
    anthropicClient: null,
    queryEngine: null,
    mcpClients: [],
    wsConnections: new Set(),
    abortController: new AbortController(),
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    isHeadless: true as const,
    // Per-session signal: each session gets its own createSignal()
    sessionSwitched: createSignal<[id: SessionId]>(),
  }
}

// ---------------------------------------------------------------------------
// 1. createIsolatedState (Task 1a)
// ---------------------------------------------------------------------------
describe('createIsolatedState (1a)', () => {
  test('returns a state object with all default fields', () => {
    const state = createIsolatedState()
    expect(typeof state.sessionId).toBe('string')
    expect(state.sessionId.length).toBeGreaterThan(0)
    expect(state.totalCostUSD).toBe(0)
    expect(state.cwd).toBeDefined()
    expect(state.isInteractive).toBe(false)
    expect(state.modelUsage).toEqual({})
  })

  test('applies overrides on top of defaults', () => {
    const state = createIsolatedState({ totalCostUSD: 42.5, cwd: '/custom' })
    expect(state.totalCostUSD).toBe(42.5)
    expect(state.cwd).toBe('/custom')
    // Other fields remain default
    expect(state.isInteractive).toBe(false)
  })

  test('creates independent copies — mutations do not cross-contaminate', () => {
    const a = createIsolatedState({ totalCostUSD: 10 })
    const b = createIsolatedState({ totalCostUSD: 20 })
    a.totalCostUSD = 100
    expect(a.totalCostUSD).toBe(100)
    expect(b.totalCostUSD).toBe(20)
  })

  test('each call generates a unique sessionId', () => {
    const a = createIsolatedState()
    const b = createIsolatedState()
    expect(a.sessionId).not.toBe(b.sessionId)
  })
})

// ---------------------------------------------------------------------------
// 2. SessionContext ALS basics (Task 1d)
// ---------------------------------------------------------------------------
describe('SessionContext ALS basics (1d)', () => {
  test('getSessionContext returns undefined outside of ALS context', () => {
    expect(getSessionContext()).toBeUndefined()
  })

  test('runWithSessionContext sets and restores context', () => {
    const ctx = makeSessionContext('test-123')
    let captured: SessionContext | undefined

    runWithSessionContext(ctx, () => {
      captured = getSessionContext()
    })

    expect(captured).toBe(ctx)
    expect(getSessionContext()).toBeUndefined()
  })

  test('nested contexts do not clobber each other', () => {
    const outer = makeSessionContext('outer')
    const inner = makeSessionContext('inner')
    let capturedInner: SessionContext | undefined
    let capturedOuter: SessionContext | undefined

    runWithSessionContext(outer, () => {
      runWithSessionContext(inner, () => {
        capturedInner = getSessionContext()
      })
      capturedOuter = getSessionContext()
    })

    expect(capturedInner?.sessionId).toBe('inner')
    expect(capturedOuter?.sessionId).toBe('outer')
  })

  test('async continuations preserve context', async () => {
    const ctx = makeSessionContext('async-123')
    let captured: SessionContext | undefined

    await runWithSessionContext(ctx, async () => {
      await Promise.resolve()
      captured = getSessionContext()
    })

    expect(captured).toBe(ctx)
    expect(getSessionContext()).toBeUndefined()
  })

  test('isServerMode returns false outside ALS context', () => {
    expect(isServerMode()).toBe(false)
  })

  test('isServerMode returns true inside ALS context', () => {
    const ctx = makeSessionContext('server-1')
    let result: boolean = false

    runWithSessionContext(ctx, () => {
      result = isServerMode()
    })

    expect(result).toBe(true)
    expect(isServerMode()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. sessionSwitched per-session isolation (Task 1c)
// ---------------------------------------------------------------------------
describe('sessionSwitched per-session isolation (1c)', () => {
  test('switchSession updates per-session state in ALS context', () => {
    const ctx = makeSessionContext('original-session')
    let newId: string | undefined

    runWithSessionContext(ctx, () => {
      switchSession('new-session-id' as SessionId)
      newId = getSessionId()
    })

    expect(newId).toBe('new-session-id')
    expect(ctx.state.sessionId).toBe('new-session-id')
  })

  test('switchSession does not modify global STATE when in ALS context', () => {
    const globalIdBefore = getSessionId()
    const ctx = makeSessionContext('als-session')

    runWithSessionContext(ctx, () => {
      switchSession('als-new-session' as SessionId)
    })

    const globalIdAfter = getSessionId()
    expect(globalIdAfter).toBe(globalIdBefore)
  })

  test('onSessionSwitch subscribes to per-session signal in ALS context', () => {
    const ctx = makeSessionContext('sub-session')
    const receivedIds: string[] = []

    runWithSessionContext(ctx, () => {
      onSessionSwitch((id) => {
        receivedIds.push(id)
      })
      switchSession('switched-1' as SessionId)
    })

    expect(receivedIds).toEqual(['switched-1'])
  })

  test('onSessionSwitch does not receive events from other sessions', () => {
    const ctxA = makeSessionContext('session-A')
    const ctxB = makeSessionContext('session-B')
    const receivedA: string[] = []
    const receivedB: string[] = []

    // Subscribe in A
    runWithSessionContext(ctxA, () => {
      onSessionSwitch((id) => receivedA.push(id))
    })

    // Subscribe in B
    runWithSessionContext(ctxB, () => {
      onSessionSwitch((id) => receivedB.push(id))
    })

    // Switch in B — should only notify B's subscribers
    runWithSessionContext(ctxB, () => {
      switchSession('B-switched' as SessionId)
    })

    // Switch in A — should only notify A's subscribers
    runWithSessionContext(ctxA, () => {
      switchSession('A-switched' as SessionId)
    })

    expect(receivedA).toEqual(['A-switched'])
    expect(receivedB).toEqual(['B-switched'])
  })

  test('onSessionSwitch unsubscribe works correctly in ALS context', () => {
    const ctx = makeSessionContext('unsub-session')
    const received: string[] = []

    runWithSessionContext(ctx, () => {
      const unsub = onSessionSwitch((id) => received.push(id))
      switchSession('first' as SessionId)
      unsub()
      switchSession('second' as SessionId)
    })

    expect(received).toEqual(['first'])
  })

  test('switchSession updates sessionProjectDir in per-session state', () => {
    const ctx = makeSessionContext('projdir-session')

    runWithSessionContext(ctx, () => {
      switchSession('new-id' as SessionId, '/custom/project/dir')
    })

    expect(ctx.state.sessionProjectDir).toBe('/custom/project/dir')
  })
})

// ---------------------------------------------------------------------------
// 4. getSessionId ALS routing (Task 1e partial - already completed)
// ---------------------------------------------------------------------------
describe('getSessionId ALS routing', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    resetStateForTests()
  })

  test('returns ALS-scoped sessionId in ALS context', () => {
    const ctx = makeSessionContext('als-session-1')
    let id: string | undefined

    runWithSessionContext(ctx, () => {
      id = getSessionId()
    })

    expect(id).toBe('als-session-1')
  })

  test('returns global STATE sessionId outside ALS context', () => {
    const globalId = getSessionId()
    expect(typeof globalId).toBe('string')
    expect(globalId.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 5. CLI compatibility
// ---------------------------------------------------------------------------
describe('CLI compatibility', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    resetStateForTests()
  })

  test('switchSession works in CLI mode (no ALS context)', () => {
    const originalId = getSessionId()
    switchSession('cli-switched' as SessionId)
    expect(getSessionId()).toBe('cli-switched')
    expect(getSessionId()).not.toBe(originalId)
  })

  test('onSessionSwitch works in CLI mode (no ALS context)', () => {
    const received: string[] = []
    const unsub = onSessionSwitch((id) => received.push(id))

    switchSession('cli-signal-1' as SessionId)
    switchSession('cli-signal-2' as SessionId)

    expect(received).toEqual(['cli-signal-1', 'cli-signal-2'])

    unsub()
    switchSession('cli-signal-3' as SessionId)
    expect(received).toEqual(['cli-signal-1', 'cli-signal-2'])
  })

  test('isServerMode returns false in CLI mode', () => {
    expect(isServerMode()).toBe(false)
  })
})
