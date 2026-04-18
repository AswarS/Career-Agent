/**
 * batch2-als-fixes.test.ts -- Tests for Batch 2 ALS routing fixes
 *
 * Covers two fixes that routed previously-global state accessors
 * through the ALS-aware getState() dispatcher:
 *
 *   1. getIsHeadless() ALS routing -- was reading STATE.isInteractive
 *      directly; now uses getState() so multi-user server sessions get
 *      per-session isolation.
 *
 *   2. regenerateSessionId() ALS routing -- was reading/writing STATE
 *      directly; now uses getState() so session ID regeneration is
 *      scoped to the correct per-session state in server mode.
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
  getIsHeadless,
  regenerateSessionId,
  getParentSessionId,
  setIsInteractive,
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
    sessionSwitched: createSignal<[id: SessionId]>(),
  }
}

// ---------------------------------------------------------------------------
// Fix 1: getIsHeadless() ALS routing
// ---------------------------------------------------------------------------
describe('getIsHeadless() ALS routing', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    resetStateForTests()
  })

  test('returns true when isInteractive is false in ALS context', () => {
    const ctx = makeSessionContext('headless-false', { isInteractive: false })

    let result: boolean | undefined
    runWithSessionContext(ctx, () => {
      result = getIsHeadless()
    })

    expect(result).toBe(true)
  })

  test('returns false when isInteractive is true in ALS context', () => {
    const ctx = makeSessionContext('headless-true', { isInteractive: true })

    let result: boolean | undefined
    runWithSessionContext(ctx, () => {
      result = getIsHeadless()
    })

    expect(result).toBe(false)
  })

  test('changing isInteractive in session A does not affect getIsHeadless() in session B', () => {
    const ctxA = makeSessionContext('session-A', { isInteractive: false })
    const ctxB = makeSessionContext('session-B', { isInteractive: false })

    // Set session A to interactive (non-headless)
    runWithSessionContext(ctxA, () => {
      setIsInteractive(true)
    })

    let headlessA: boolean | undefined
    let headlessB: boolean | undefined

    runWithSessionContext(ctxA, () => {
      headlessA = getIsHeadless()
    })
    runWithSessionContext(ctxB, () => {
      headlessB = getIsHeadless()
    })

    // A should be non-headless (interactive=true), B should remain headless
    expect(headlessA).toBe(false)
    expect(headlessB).toBe(true)
  })

  test('outside ALS context, getIsHeadless() returns !isInteractive from global STATE', () => {
    // Global STATE starts with isInteractive=false (default from getInitialState)
    resetStateForTests()
    expect(getIsHeadless()).toBe(true)

    // Flip global to interactive
    setIsInteractive(true)
    expect(getIsHeadless()).toBe(false)

    // Reset back
    setIsInteractive(false)
    expect(getIsHeadless()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Fix 2: regenerateSessionId() ALS routing
// ---------------------------------------------------------------------------
describe('regenerateSessionId() ALS routing', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    resetStateForTests()
  })

  test('in ALS context, regenerateSessionId() modifies per-session state, not global STATE', () => {
    const ctx = makeSessionContext('als-regen-session')
    const globalIdBefore = getSessionId()
    const alsIdBefore = ctx.state.sessionId

    let regeneratedId: SessionId | undefined
    runWithSessionContext(ctx, () => {
      regeneratedId = regenerateSessionId()
    })

    // The per-session state should have the new ID
    expect(regeneratedId).toBeDefined()
    expect(typeof regeneratedId).toBe('string')
    expect(regeneratedId).not.toBe(alsIdBefore)
    expect(ctx.state.sessionId).toBe(regeneratedId)

    // Global STATE should be completely unaffected
    expect(getSessionId()).toBe(globalIdBefore)
  })

  test('regenerating in session A does not affect session B sessionId', () => {
    const ctxA = makeSessionContext('session-A-regen')
    const ctxB = makeSessionContext('session-B-regen')
    const originalIdB = ctxB.state.sessionId

    let regeneratedIdA: SessionId | undefined

    // Regenerate in session A
    runWithSessionContext(ctxA, () => {
      regeneratedIdA = regenerateSessionId()
    })

    let currentIdB: SessionId | undefined

    // Verify session B is untouched
    runWithSessionContext(ctxB, () => {
      currentIdB = getSessionId()
    })

    expect(currentIdB).toBe(originalIdB)
    expect(regeneratedIdA).not.toBe(originalIdB)
    expect(ctxA.state.sessionId).not.toBe(ctxB.state.sessionId)
  })

  test('regenerateSessionId({ setCurrentAsParent: true }) sets parentSessionId in per-session state', () => {
    const ctx = makeSessionContext('parent-tracking-session')
    const originalId = ctx.state.sessionId

    // Verify no parent before regeneration
    expect(ctx.state.parentSessionId).toBeUndefined()

    let regeneratedId: SessionId | undefined
    runWithSessionContext(ctx, () => {
      regeneratedId = regenerateSessionId({ setCurrentAsParent: true })
    })

    // The new ID should differ from the original
    expect(regeneratedId).not.toBe(originalId)

    // The per-session state should have recorded the original as parent
    expect(ctx.state.parentSessionId).toBe(originalId)

    // getParentSessionId() should also return the original within ALS context
    let parentId: SessionId | undefined
    runWithSessionContext(ctx, () => {
      parentId = getParentSessionId()
    })
    expect(parentId).toBe(originalId)
  })

  test('outside ALS context, regenerateSessionId() works normally on global STATE', () => {
    resetStateForTests()

    const originalGlobalId = getSessionId()
    const newId = regenerateSessionId()

    // A new ID should be generated
    expect(newId).toBeDefined()
    expect(typeof newId).toBe('string')
    expect(newId).not.toBe(originalGlobalId)

    // getSessionId() should now return the new ID
    expect(getSessionId()).toBe(newId)
  })

  test('after regeneration, getSessionId() returns the new ID within the ALS context', () => {
    const ctx = makeSessionContext('post-regen-session')
    const originalId = ctx.state.sessionId

    let idAfterRegen: SessionId | undefined
    let getSessionIdResult: SessionId | undefined

    runWithSessionContext(ctx, () => {
      regenerateSessionId()
      idAfterRegen = ctx.state.sessionId
      getSessionIdResult = getSessionId()
    })

    // Both should reflect the regenerated ID
    expect(getSessionIdResult).toBe(idAfterRegen)
    expect(getSessionIdResult).not.toBe(originalId)
  })

  test('regenerateSessionId resets sessionProjectDir to null in per-session state', () => {
    const ctx = makeSessionContext('projectdir-session', {
      sessionProjectDir: '/some/custom/dir',
    })

    expect(ctx.state.sessionProjectDir).toBe('/some/custom/dir')

    runWithSessionContext(ctx, () => {
      regenerateSessionId()
    })

    expect(ctx.state.sessionProjectDir).toBeNull()
  })

  test('regenerateSessionId clears planSlugCache entry for old session ID', () => {
    const ctx = makeSessionContext('slug-cache-session')
    const oldId = ctx.state.sessionId

    // Seed the plan slug cache with an entry for the current session ID
    ctx.state.planSlugCache.set(oldId, 'my-plan-slug')
    expect(ctx.state.planSlugCache.has(oldId)).toBe(true)

    runWithSessionContext(ctx, () => {
      regenerateSessionId()
    })

    // The old session ID's slug entry should be gone
    expect(ctx.state.planSlugCache.has(oldId)).toBe(false)
  })

  test('multiple regenerations each produce unique IDs in per-session state', () => {
    const ctx = makeSessionContext('multi-regen-session')
    const ids: SessionId[] = []

    runWithSessionContext(ctx, () => {
      for (let i = 0; i < 5; i++) {
        ids.push(regenerateSessionId())
      }
    })

    // All IDs should be unique
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)

    // The last regenerated ID should be the current session ID
    expect(ctx.state.sessionId).toBe(ids[ids.length - 1])
  })
})
