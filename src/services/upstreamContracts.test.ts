import { describe, expect, it } from 'vitest';
import { normalizeArtifactRecord, normalizeProfileSuggestion } from './upstreamContracts';

describe('normalizeArtifactRecord', () => {
  it('maps snake_case fields and queued status into the frontend artifact shape', () => {
    const artifact = normalizeArtifactRecord({
      id: 'artifact-weekly-plan',
      type: 'weekly-plan',
      title: 'Weekly Plan',
      status: 'queued',
      render_mode: 'html',
      revision: 4,
      updated_at: '2026-04-08T05:00:00Z',
      summary: 'Queued for refresh.',
      payload: {
        html: '<div>hello</div>',
      },
    });

    expect(artifact).toEqual({
      id: 'artifact-weekly-plan',
      type: 'weekly-plan',
      title: 'Weekly Plan',
      status: 'loading',
      renderMode: 'html',
      revision: 4,
      updatedAt: '2026-04-08T05:00:00Z',
      summary: 'Queued for refresh.',
      payload: {
        html: '<div>hello</div>',
      },
    });
  });
});

describe('normalizeProfileSuggestion', () => {
  it('copies array patches into a new suggestion object', () => {
    const incomingArray = ['Frontend implementation', 'AI-assisted delivery'];
    const suggestion = normalizeProfileSuggestion({
      id: 'suggestion-strengths',
      title: 'Sharpen strengths',
      rationale: 'Use clearer phrasing.',
      source_thread_id: 'thread-002',
      patch: {
        keyStrengths: incomingArray,
      },
    });

    expect(suggestion.sourceThreadId).toBe('thread-002');
    expect(suggestion.patch.keyStrengths).toEqual(incomingArray);
    expect(suggestion.patch.keyStrengths).not.toBe(incomingArray);
  });
});
