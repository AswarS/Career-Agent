import { describe, expect, it } from 'vitest';
import { normalizeArtifactRecord, normalizeProfileSuggestion, normalizeThreadMessage } from './upstreamContracts';

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

  it('preserves trusted url render mode payloads for application-host artifacts', () => {
    const artifact = normalizeArtifactRecord({
      id: 'artifact-career-roadmap',
      type: 'career-roadmap',
      title: 'Career Roadmap Lab',
      status: 'ready',
      render_mode: 'url',
      revision: 2,
      updated_at: '2026-04-10T03:00:00Z',
      summary: 'Hosted via application URL.',
      payload: {
        url: '/mock-node-canvas/index.html',
      },
    });

    expect(artifact.renderMode).toBe('url');
    if (artifact.renderMode !== 'url') {
      throw new Error('expected url artifact');
    }

    expect(artifact.payload.url).toBe('/mock-node-canvas/index.html');
  });

  it('provides safe empty html payloads when html mode arrives without markup', () => {
    const artifact = normalizeArtifactRecord({
      id: 'artifact-empty-html',
      type: 'weekly-plan',
      title: 'Empty HTML',
      status: 'ready',
      render_mode: 'html',
      revision: 1,
      summary: 'Missing html markup.',
      payload: {},
    });

    expect(artifact.renderMode).toBe('html');
    if (artifact.renderMode !== 'html') {
      throw new Error('expected html artifact');
    }

    expect(artifact.payload.html).toBe('');
  });
});

describe('normalizeThreadMessage', () => {
  it('extracts inline think blocks and maps agent metadata into the frontend message shape', () => {
    const message = normalizeThreadMessage({
      id: 'message-001',
      role: 'assistant',
      content: '<think>先比较路径，再决定输出什么。</think>\n\n给你一版更聚焦的建议。',
      agent_name: '方向助手',
      agent_accent: 'blue',
      created_at: '2026-04-10T08:00:00Z',
    }, 'thread-001');

    expect(message.threadId).toBe('thread-001');
    expect(message.content).toBe('给你一版更聚焦的建议。');
    expect(message.reasoning).toBe('先比较路径，再决定输出什么。');
    expect(message.agentName).toBe('方向助手');
    expect(message.agentAccent).toBe('blue');
  });

  it('does not strip literal think tags from non-assistant messages', () => {
    const message = normalizeThreadMessage({
      id: 'message-002',
      role: 'user',
      content: '请保留这段字面量：<think>debug</think>',
      created_at: '2026-04-10T08:01:00Z',
    }, 'thread-001');

    expect(message.content).toBe('请保留这段字面量：<think>debug</think>');
    expect(message.reasoning).toBeNull();
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
