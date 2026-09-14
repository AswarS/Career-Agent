/* Multi-Agent local telemetry runtime v1.0. Copy inline or ship beside index.html. */
(function installAgentTelemetry(global) {
  'use strict';

  const VERSION = '1.0';
  const MAX_EVENTS = 1000;
  const ALLOWED_DATA_KEYS = new Set([
    'correct', 'errorCategory', 'attempt', 'hintLevel', 'valueBucket',
    'parameter', 'direction', 'outcome', 'milestone', 'durationBucket',
    'itemType', 'difficulty', 'coverage', 'completed',
    'score', 'bestStreak', 'attempts'
  ]);

  function randomId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'session-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function safeObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const clean = {};
    for (const [key, item] of Object.entries(value)) {
      if (!ALLOWED_DATA_KEYS.has(key)) continue;
      if (['string', 'number', 'boolean'].includes(typeof item) && String(item).length <= 80) {
        clean[key] = item;
      }
    }
    return clean;
  }

  function create(options) {
    const config = Object.assign({
      appSlug: 'interactive-app',
      scene: 'visualize',
      metricReducer: () => [],
      inferenceReducer: () => []
    }, options || {});
    const storageKey = `multi-agent:${config.appSlug}:telemetry:${VERSION}`;
    let storageAvailable = true;
    let state;

    function freshState() {
      return { sessionId: randomId(), startedAt: Date.now(), completed: false, events: [], seqCounter: 0 };
    }

    try {
      state = JSON.parse(global.localStorage.getItem(storageKey)) || freshState();
      // Older stored states lack the monotonic counter; derive it from length.
      if (!Number.isFinite(state.seqCounter)) state.seqCounter = state.events.length;
    } catch (_) {
      storageAvailable = false;
      state = freshState();
    }

    function persist() {
      if (!storageAvailable) return;
      try {
        global.localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (_) {
        storageAvailable = false;
      }
    }

    function record(type, payload) {
      if (typeof type !== 'string' || !/^[a-z][a-z0-9_]{1,48}$/.test(type)) return null;
      // Completion is a state transition, not a repeatable click event. Apps
      // often auto-complete and also expose an explicit Finish button.
      if (type === 'session_completed' && state.completed) {
        uploadNow({ includeSession: true, includeFeedback: true });
        const prior = state.events.slice().reverse().find(event => event.type === type);
        return prior ? prior.seq : null;
      }
      const input = payload || {};
      state.seqCounter += 1;
      const event = {
        v: VERSION,
        sessionId: state.sessionId,
        seq: state.seqCounter,
        at: new Date().toISOString(),
        elapsedMs: Math.max(0, Date.now() - state.startedAt),
        type,
        scene: config.scene,
        target: typeof input.target === 'string' ? input.target.slice(0, 80) : undefined,
        data: safeObject(input.data)
      };
      state.events.push(event);
      if (state.events.length > MAX_EVENTS) state.events.shift();
      if (type === 'session_completed') {
        state.completed = true;
        persist();
        uploadNow({ includeSession: true, includeFeedback: true });
        return event.seq;
      }
      persist();
      return event.seq;
    }

    function getEvents() {
      return JSON.parse(JSON.stringify(state.events));
    }

    function getFeedback() {
      const events = getEvents();
      const durationMs = events.length ? events[events.length - 1].elapsedMs : 0;
      const observations = config.metricReducer(events) || [];
      const inferences = config.inferenceReducer(events, observations) || [];
      return {
        schema: 'multi-agent-feedback/1.0',
        session: {
          id: state.sessionId,
          durationMs,
          eventCount: events.length,
          completed: state.completed,
          storage: storageAvailable ? 'local' : 'memory'
        },
        observations,
        inferences: inferences.filter(item =>
          item && ['low', 'medium', 'high'].includes(item.confidence) &&
          Array.isArray(item.evidence) && item.evidence.length > 0 && item.nextAction
        ),
        limitations: ['Local session evidence only; do not generalize beyond this task.'],
        recentEvents: events.slice(-20)
      };
    }

    function exportSession() {
      const content = JSON.stringify({
        metadata: { appSlug: config.appSlug, scene: config.scene, telemetryVersion: VERSION },
        feedback: getFeedback(),
        events: getEvents()
      }, null, 2);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${config.appSlug}-${state.sessionId}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return content;
    }

    function clear() {
      uploadNow({ includeSession: true, includeFeedback: true });
      if (storageAvailable) global.localStorage.removeItem(storageKey);
      state = freshState();
      record('session_cleared');
      return state.sessionId;
    }

    // --- Best-effort upload to the host agent (closed loop) ---

    let uploadConfig = null;
    let lastUploadedSeq = 0;
    let flushTimer = null;
    let unloadListener = null;

    function uploadNow(flags) {
      if (!uploadConfig || typeof global.fetch !== 'function') return;
      const includeSession = Boolean(flags && flags.includeSession);
      const includeFeedback = Boolean(flags && flags.includeFeedback);
      const pending = state.events.filter(event => event.seq > lastUploadedSeq);
      if (!pending.length && !includeSession && !includeFeedback) return;
      const batch = pending.slice(-uploadConfig.batchSize);
      if (!batch.length && !includeSession && !includeFeedback) return;

      const body = {
        schema: 'app-event-batch/1.0',
        session_id: state.sessionId,
        sequence_start: batch.length ? batch[0].seq : 0,
        events: batch.map(event => ({
          seq: event.seq,
          type: event.type,
          at: event.at,
          ...(event.target ? { target: event.target } : {}),
          data: event.data || {}
        })),
        ...(includeSession ? {
          session: {
            durationMs: Math.max(0, Date.now() - state.startedAt),
            eventCount: state.events.length,
            completed: state.completed
          }
        } : {}),
        ...(includeFeedback ? { feedback: getFeedback() } : {})
      };

      const batchEndSeq = batch.length ? batch[batch.length - 1].seq : 0;
      global.fetch(new URL(uploadConfig.endpoint, global.location.href).href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true
      }).then(response => {
        if (response.ok && batchEndSeq > lastUploadedSeq) lastUploadedSeq = batchEndSeq;
      }).catch(() => {
        // Best-effort: local retention is unchanged on network failure.
      });
    }

    function attachUploader(uploadOptions) {
      if (!uploadOptions || !uploadOptions.endpoint || typeof global.fetch !== 'function') {
        return () => {};
      }
      uploadConfig = Object.assign({
        endpoint: null,
        batchSize: 20,
        flushIntervalMs: 5000
      }, uploadOptions);
      if (flushTimer) global.clearInterval(flushTimer);
      flushTimer = global.setInterval(() => uploadNow(), uploadConfig.flushIntervalMs);
      if (unloadListener) global.removeEventListener('beforeunload', unloadListener);
      unloadListener = () => uploadNow({ includeSession: true, includeFeedback: true });
      global.addEventListener('beforeunload', unloadListener);
      return () => {
        if (flushTimer) global.clearInterval(flushTimer);
        if (unloadListener) global.removeEventListener('beforeunload', unloadListener);
        flushTimer = null;
        unloadListener = null;
        uploadConfig = null;
      };
    }

    record(state.events.length ? 'session_resumed' : 'session_started');
    const api = {
      record,
      getEvents,
      getFeedback,
      // Alias required by quality gates and evals; same implementation.
      get_agent_feedback: getFeedback,
      export: exportSession,
      clear,
      attachUploader
    };
    return api;
  }

  global.createAgentTelemetry = create;
})(window);
