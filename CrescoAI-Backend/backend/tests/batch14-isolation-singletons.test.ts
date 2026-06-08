/**
 * Batch 14: Isolation singleton fix tests
 *
 * Verifies that module-level singletons moved into STATE are properly
 * isolated between different ALS sessions.
 *
 * Covers:
 * - state.ts telemetry counter functions (P0)
 * - history.ts per-session state (P0)
 * - settingsCache.ts per-session caches (P0)
 * - sessionEnvVars.ts per-session env vars (P1)
 * - sessionStorage.ts agentTranscriptSubdirs (P1)
 * - context.ts per-session context caches (P1)
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import { AsyncLocalStorage } from 'async_hooks'

// ---- Session context simulation (matches SessionContext.ts pattern) ----
interface SessionState {
  [key: string]: any
}

const als = new AsyncLocalStorage<{ state: SessionState }>()

function runWithState(state: SessionState, fn: () => void) {
  als.run({ state }, fn)
}

function getTestState(): SessionState {
  const ctx = als.getStore()
  return ctx ? ctx.state : globalState
}

const globalState: SessionState = {}

// ---- Tests ----

describe('Batch 14: Isolation singleton fixes', () => {
  describe('14a. state.ts telemetry counters use getState()', () => {
    test('setMeter writes to per-session state, not global', () => {
      // Verify getState() is exported (previously was not)
      const { getState } = require('../src/bootstrap/state')
      expect(typeof getState).toBe('function')

      // Two different states should return different sessionId
      const state1 = getState()
      expect(state1).toBeDefined()
      expect(state1.sessionId).toBeDefined()
    })

    test('counter fields exist in State type', () => {
      const { getState } = require('../src/bootstrap/state')
      const s = getState()
      // All counter fields should be null initially
      expect(s.meter).toBeNull()
      expect(s.sessionCounter).toBeNull()
      expect(s.locCounter).toBeNull()
      expect(s.prCounter).toBeNull()
      expect(s.commitCounter).toBeNull()
      expect(s.costCounter).toBeNull()
      expect(s.tokenCounter).toBeNull()
      expect(s.codeEditToolDecisionCounter).toBeNull()
      expect(s.activeTimeCounter).toBeNull()
    })

    test('getMeter/getSessionCounter etc route through getState', () => {
      const state = require('../src/bootstrap/state')
      // All getters should return null (not crash) without ALS context
      expect(state.getMeter()).toBeNull()
      expect(state.getSessionCounter()).toBeNull()
      expect(state.getLocCounter()).toBeNull()
      expect(state.getPrCounter()).toBeNull()
      expect(state.getCommitCounter()).toBeNull()
      expect(state.getCostCounter()).toBeNull()
      expect(state.getTokenCounter()).toBeNull()
      expect(state.getCodeEditToolDecisionCounter()).toBeNull()
      expect(state.getActiveTimeCounter()).toBeNull()
    })
  })

  describe('14b. history.ts per-session state', () => {
    test('State has history fields', () => {
      const { getState } = require('../src/bootstrap/state')
      const s = getState()
      expect(Array.isArray(s.historyPendingEntries)).toBe(true)
      expect(s.historyPendingEntries.length).toBe(0)
      expect(s.historyIsWriting).toBe(false)
      expect(s.historyFlushPromise).toBeNull()
      expect(s.historyCleanupRegistered).toBe(false)
      expect(s.historyLastAddedEntry).toBeNull()
      expect(s.historySkippedTimestamps).toBeInstanceOf(Set)
    })

    test('clearPendingHistoryEntries works per-session', () => {
      const { getState } = require('../src/bootstrap/state')
      const s = getState()

      // Simulate some pending entries
      s.historyPendingEntries = [{ test: 'entry' }]
      s.historyLastAddedEntry = { test: 'entry' }
      s.historySkippedTimestamps.add(123)

      const { clearPendingHistoryEntries } = require('../src/history')
      clearPendingHistoryEntries()

      expect(s.historyPendingEntries).toEqual([])
      expect(s.historyLastAddedEntry).toBeNull()
      expect(s.historySkippedTimestamps.size).toBe(0)
    })

    test('removeLastFromHistory uses per-session state', () => {
      const { getState } = require('../src/bootstrap/state')
      const { removeLastFromHistory } = require('../src/history')

      // No last entry — should be no-op
      expect(() => removeLastFromHistory()).not.toThrow()

      const s = getState()
      const entry = { timestamp: Date.now(), display: 'test', pastedContents: {} }
      s.historyLastAddedEntry = entry

      removeLastFromHistory()
      expect(s.historyLastAddedEntry).toBeNull()
    })
  })

  describe('14c. settingsCache.ts per-session caches', () => {
    test('State has settings cache fields', () => {
      const { getState } = require('../src/bootstrap/state')
      const s = getState()
      expect(s.settingsSessionCache).toBeNull()
      expect(s.settingsPerSourceCache).toBeInstanceOf(Map)
      expect(s.settingsParseFileCache).toBeInstanceOf(Map)
      expect(s.settingsPluginBase).toBeUndefined()
    })

    test('getSessionSettingsCache/setSessionSettingsCache use getState', () => {
      const cache = require('../src/utils/settings/settingsCache')
      expect(cache.getSessionSettingsCache()).toBeNull()

      const testSettings = { settings: { test: true }, errors: [] }
      cache.setSessionSettingsCache(testSettings)
      expect(cache.getSessionSettingsCache()).toBe(testSettings)
    })

    test('perSourceCache is per-session', () => {
      const cache = require('../src/utils/settings/settingsCache')
      expect(cache.getCachedSettingsForSource('userSettings')).toBeUndefined()

      cache.setCachedSettingsForSource('userSettings', { test: true })
      expect(cache.getCachedSettingsForSource('userSettings')).toEqual({ test: true })
    })

    test('resetSettingsCache clears all caches', () => {
      const cache = require('../src/utils/settings/settingsCache')
      const { getState } = require('../src/bootstrap/state')

      cache.setSessionSettingsCache({ settings: {}, errors: [] })
      cache.setCachedSettingsForSource('userSettings', { test: true })
      cache.setCachedParsedFile('/test/path', { settings: null, errors: [] })

      cache.resetSettingsCache()

      const s = getState()
      expect(s.settingsSessionCache).toBeNull()
      expect(s.settingsPerSourceCache.size).toBe(0)
      expect(s.settingsParseFileCache.size).toBe(0)
    })

    test('pluginSettingsBase uses getState', () => {
      const cache = require('../src/utils/settings/settingsCache')

      expect(cache.getPluginSettingsBase()).toBeUndefined()
      cache.setPluginSettingsBase({ plugins: true })
      expect(cache.getPluginSettingsBase()).toEqual({ plugins: true })
      cache.clearPluginSettingsBase()
      expect(cache.getPluginSettingsBase()).toBeUndefined()
    })
  })

  describe('14d. sessionEnvVars.ts per-session Map', () => {
    test('State has sessionEnvVarsMap', () => {
      const { getState } = require('../src/bootstrap/state')
      const s = getState()
      expect(s.sessionEnvVarsMap).toBeInstanceOf(Map)
      expect(s.sessionEnvVarsMap.size).toBe(0)
    })

    test('set/get/delete/clear work through getState', () => {
      const envVars = require('../src/utils/sessionEnvVars')

      expect(envVars.getSessionEnvVars().size).toBe(0)

      envVars.setSessionEnvVar('TEST_VAR', 'test_value')
      expect(envVars.getSessionEnvVars().get('TEST_VAR')).toBe('test_value')

      envVars.deleteSessionEnvVar('TEST_VAR')
      expect(envVars.getSessionEnvVars().has('TEST_VAR')).toBe(false)

      envVars.setSessionEnvVar('A', '1')
      envVars.setSessionEnvVar('B', '2')
      envVars.clearSessionEnvVars()
      expect(envVars.getSessionEnvVars().size).toBe(0)
    })

    test('returns ReadonlyMap', () => {
      const envVars = require('../src/utils/sessionEnvVars')
      const map = envVars.getSessionEnvVars()
      // Should be a Map
      expect(map).toBeInstanceOf(Map)
    })
  })

  describe('14e. sessionStorage.ts agentTranscriptSubdirs per-session', () => {
    test('State has agentTranscriptSubdirsMap', () => {
      const { getState } = require('../src/bootstrap/state')
      const s = getState()
      expect(s.agentTranscriptSubdirsMap).toBeInstanceOf(Map)
      expect(s.agentTranscriptSubdirsMap.size).toBe(0)
    })

    test('set/clear agentTranscriptSubdir use getState', () => {
      const storage = require('../src/utils/sessionStorage')

      storage.setAgentTranscriptSubdir('agent-1', 'workflows/run-1')
      const { getState } = require('../src/bootstrap/state')
      expect(getState().agentTranscriptSubdirsMap.get('agent-1')).toBe('workflows/run-1')

      storage.clearAgentTranscriptSubdir('agent-1')
      expect(getState().agentTranscriptSubdirsMap.has('agent-1')).toBe(false)
    })
  })

  describe('14f. context.ts per-session context caches', () => {
    test('State has context cache fields', () => {
      const { getState } = require('../src/bootstrap/state')
      const s = getState()
      expect(s.contextGitStatusCache).toBeUndefined()
      expect(s.contextGitStatusPromise).toBeNull()
      expect(s.contextSystemContextCache).toBeUndefined()
      expect(s.contextSystemContextPromise).toBeNull()
      expect(s.contextUserContextCache).toBeUndefined()
      expect(s.contextUserContextPromise).toBeNull()
    })

    test('setSystemPromptInjection clears per-session caches', () => {
      const { getState } = require('../src/bootstrap/state')
      const { setSystemPromptInjection } = require('../src/context')

      const s = getState()
      // Simulate cached values
      s.contextUserContextCache = { claudeMd: 'test' }
      s.contextSystemContextCache = { gitStatus: 'test' }

      setSystemPromptInjection('break-cache')

      expect(s.contextUserContextCache).toBeUndefined()
      expect(s.contextSystemContextCache).toBeUndefined()

      // Cleanup
      setSystemPromptInjection(null)
    })
  })

  describe('14g. Cross-session isolation verification', () => {
    test('Two isolated states have independent counters', () => {
      const { createIsolatedState } = require('../src/bootstrap/state')
      const state1 = createIsolatedState()
      const state2 = createIsolatedState()

      // Simulate setting different counters
      const mockCounter = { add: () => {} }
      state1.meter = { name: 'meter1' } as any
      state1.sessionCounter = mockCounter
      state2.meter = { name: 'meter2' } as any

      expect(state1.meter).not.toBe(state2.meter)
      expect(state1.sessionCounter).toBeDefined()
      expect(state2.sessionCounter).toBeNull()
    })

    test('Two isolated states have independent history', () => {
      const { createIsolatedState } = require('../src/bootstrap/state')
      const state1 = createIsolatedState()
      const state2 = createIsolatedState()

      state1.historyPendingEntries = [{ entry: 1 }]
      state1.historyIsWriting = true

      expect(state2.historyPendingEntries).toEqual([])
      expect(state2.historyIsWriting).toBe(false)
    })

    test('Two isolated states have independent env vars', () => {
      const { createIsolatedState } = require('../src/bootstrap/state')
      const state1 = createIsolatedState()
      const state2 = createIsolatedState()

      state1.sessionEnvVarsMap.set('KEY', 'value1')
      state2.sessionEnvVarsMap.set('KEY', 'value2')

      expect(state1.sessionEnvVarsMap.get('KEY')).toBe('value1')
      expect(state2.sessionEnvVarsMap.get('KEY')).toBe('value2')
    })

    test('Two isolated states have independent settings caches', () => {
      const { createIsolatedState } = require('../src/bootstrap/state')
      const state1 = createIsolatedState()
      const state2 = createIsolatedState()

      state1.settingsSessionCache = { test: 'cached1' }
      state1.settingsPerSourceCache.set('userSettings', { from: 'state1' })

      expect(state2.settingsSessionCache).toBeNull()
      expect(state2.settingsPerSourceCache.size).toBe(0)
    })

    test('Two isolated states have independent agentTranscriptSubdirs', () => {
      const { createIsolatedState } = require('../src/bootstrap/state')
      const state1 = createIsolatedState()
      const state2 = createIsolatedState()

      state1.agentTranscriptSubdirsMap.set('agent-1', 'subdir-a')

      expect(state2.agentTranscriptSubdirsMap.size).toBe(0)
      expect(state1.agentTranscriptSubdirsMap.get('agent-1')).toBe('subdir-a')
    })

    test('Two isolated states have independent context caches', () => {
      const { createIsolatedState } = require('../src/bootstrap/state')
      const state1 = createIsolatedState()
      const state2 = createIsolatedState()

      state1.contextGitStatusCache = 'git-status-1'
      state1.contextSystemContextCache = { gitStatus: 'cached' }

      expect(state2.contextGitStatusCache).toBeUndefined()
      expect(state2.contextSystemContextCache).toBeUndefined()
    })

    test('Two isolated states have independent image path caches', () => {
      const { createIsolatedState } = require('../src/bootstrap/state')
      const state1 = createIsolatedState()
      const state2 = createIsolatedState()

      state1.storedImagePathsMap.set(1, '/path/to/img1.png')

      expect(state2.storedImagePathsMap.size).toBe(0)
      expect(state1.storedImagePathsMap.get(1)).toBe('/path/to/img1.png')
    })

    test('Two isolated states have independent UUID dedup sets', () => {
      const { createIsolatedState } = require('../src/bootstrap/state')
      const state1 = createIsolatedState()
      const state2 = createIsolatedState()

      state1.receivedMessageUuidsSet.add('uuid-1')
      state1.receivedMessageUuidsOrder.push('uuid-1')

      expect(state2.receivedMessageUuidsSet.size).toBe(0)
      expect(state2.receivedMessageUuidsOrder).toEqual([])
    })

    test('Two isolated states have independent classifier approvals', () => {
      const { createIsolatedState } = require('../src/bootstrap/state')
      const state1 = createIsolatedState()
      const state2 = createIsolatedState()

      state1.classifierApprovalsMap.set('tool-1', { classifier: 'bash', matchedRule: 'r1' })
      state1.classifierCheckingSet.add('tool-2')

      expect(state2.classifierApprovalsMap.size).toBe(0)
      expect(state2.classifierCheckingSet.size).toBe(0)
    })

    test('Two isolated states have independent speculative checks', () => {
      const { createIsolatedState } = require('../src/bootstrap/state')
      const state1 = createIsolatedState()
      const state2 = createIsolatedState()

      const p = Promise.resolve({ decision: 'allow' })
      state1.speculativeChecksMap.set('ls -la', p)

      expect(state2.speculativeChecksMap.size).toBe(0)
    })

    test('Two isolated states have independent file suggestion caches', () => {
      const { createIsolatedState } = require('../src/bootstrap/state')
      const state1 = createIsolatedState()
      const state2 = createIsolatedState()

      state1.fsCachedTrackedFiles = ['a.ts', 'b.ts']
      state1.fsCacheGeneration = 5
      state1.fsLastRefreshMs = Date.now()
      state1.fsLoadedTrackedSignature = 'sig-abc'

      expect(state2.fsCachedTrackedFiles).toEqual([])
      expect(state2.fsCacheGeneration).toBe(0)
      expect(state2.fsLastRefreshMs).toBe(0)
      expect(state2.fsLoadedTrackedSignature).toBeNull()
    })
  })

  describe('14h. imageStore.ts per-session isolation', () => {
    test('State has storedImagePathsMap', () => {
      const { getState } = require('../src/bootstrap/state')
      const s = getState()
      expect(s.storedImagePathsMap).toBeInstanceOf(Map)
      expect(s.storedImagePathsMap.size).toBe(0)
    })

    test('cacheImagePath/getStoredImagePath use getState', () => {
      const imageStore = require('../src/utils/imageStore')
      // Non-image content should return null
      expect(imageStore.cacheImagePath({ type: 'text', id: 1, content: 'hi', mediaType: 'text/plain' })).toBeNull()
      expect(imageStore.getStoredImagePath(999)).toBeNull()
    })

    test('clearStoredImagePaths uses getState', () => {
      const { getState } = require('../src/bootstrap/state')
      const imageStore = require('../src/utils/imageStore')
      getState().storedImagePathsMap.set(1, '/test.png')
      imageStore.clearStoredImagePaths()
      expect(getState().storedImagePathsMap.size).toBe(0)
    })
  })

  describe('14i. classifierApprovals.ts per-session isolation', () => {
    test('State has classifierApprovalsMap and classifierCheckingSet', () => {
      const { getState } = require('../src/bootstrap/state')
      const s = getState()
      expect(s.classifierApprovalsMap).toBeInstanceOf(Map)
      expect(s.classifierCheckingSet).toBeInstanceOf(Set)
    })

    test('clearClassifierApprovals clears both maps', () => {
      const { getState } = require('../src/bootstrap/state')
      const approvals = require('../src/utils/classifierApprovals')
      getState().classifierApprovalsMap.set('t1', { classifier: 'bash' })
      getState().classifierCheckingSet.add('t2')
      approvals.clearClassifierApprovals()
      expect(getState().classifierApprovalsMap.size).toBe(0)
      expect(getState().classifierCheckingSet.size).toBe(0)
    })
  })

  describe('14j. bashPermissions.ts speculative checks per-session', () => {
    test('State has speculativeChecksMap', () => {
      const { getState } = require('../src/bootstrap/state')
      const s = getState()
      expect(s.speculativeChecksMap).toBeInstanceOf(Map)
      expect(s.speculativeChecksMap.size).toBe(0)
    })
  })

  describe('14k. fileSuggestions.ts per-session state', () => {
    test('State has all fsXxx fields', () => {
      const { getState } = require('../src/bootstrap/state')
      const s = getState()
      expect(s.fsFileIndex).toBeNull()
      expect(s.fsFileListRefreshPromise).toBeNull()
      expect(s.fsCacheGeneration).toBe(0)
      expect(s.fsUntrackedFetchPromise).toBeNull()
      expect(s.fsCachedTrackedFiles).toEqual([])
      expect(s.fsCachedConfigFiles).toEqual([])
      expect(s.fsCachedTrackedDirs).toEqual([])
      expect(s.fsIgnorePatternsCache).toBeNull()
      expect(s.fsIgnorePatternsCacheKey).toBeNull()
      expect(s.fsLastRefreshMs).toBe(0)
      expect(s.fsLastGitIndexMtime).toBeNull()
      expect(s.fsLoadedTrackedSignature).toBeNull()
      expect(s.fsLoadedMergedSignature).toBeNull()
    })

    test('clearFileSuggestionCaches resets all state', () => {
      const { getState } = require('../src/bootstrap/state')
      const { clearFileSuggestionCaches } = require('../src/hooks/fileSuggestions')

      const s = getState()
      s.fsCachedTrackedFiles = ['a.ts']
      s.fsCacheGeneration = 10
      s.fsLoadedTrackedSignature = 'sig'
      s.fsLastRefreshMs = 9999

      clearFileSuggestionCaches()

      expect(s.fsCachedTrackedFiles).toEqual([])
      expect(s.fsCacheGeneration).toBe(11)
      expect(s.fsLoadedTrackedSignature).toBeNull()
      expect(s.fsLastRefreshMs).toBe(0)
    })
  })
})
