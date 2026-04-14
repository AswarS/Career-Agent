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

  it('normalizes assistant message actions into frontend canvas actions', () => {
    const message = normalizeThreadMessage({
      id: 'message-003',
      role: 'assistant',
      content: '可以打开一个模拟面试画布。',
      actions: [
        {
          id: 'action-open-interview',
          kind: 'open_artifact',
          label: '打开模拟面试',
          artifact_id: 'artifact-mock-interview',
          view_mode: 'immersive',
        },
      ],
      created_at: '2026-04-10T08:02:00Z',
    }, 'thread-001');

    expect(message.actions).toEqual([
      {
        id: 'action-open-interview',
        kind: 'open-artifact',
        label: '打开模拟面试',
        artifactId: 'artifact-mock-interview',
        viewMode: 'immersive',
      },
    ]);
  });

  it('drops unsupported assistant message actions from upstream payloads', () => {
    const message = normalizeThreadMessage({
      id: 'message-004',
      role: 'assistant',
      content: '这里混入了暂不支持的动作。',
      actions: [
        {
          id: 'action-unsupported',
          kind: 'download_artifact',
          label: '下载',
          artifact_id: 'artifact-mock-interview',
        },
        {
          id: 'action-invalid-view-mode',
          kind: 'open_artifact',
          label: '打开',
          artifact_id: 'artifact-mock-interview',
          view_mode: 'fullscreen',
        },
      ],
      created_at: '2026-04-10T08:03:00Z',
    }, 'thread-001');

    expect(message.actions).toEqual([
      {
        id: 'action-invalid-view-mode',
        kind: 'open-artifact',
        label: '打开',
        artifactId: 'artifact-mock-interview',
      },
    ]);
  });

  it('does not normalize actions from non-assistant messages', () => {
    const message = normalizeThreadMessage({
      id: 'message-005',
      role: 'user',
      content: '这条用户消息不应该打开画布。',
      actions: [
        {
          id: 'action-open-interview',
          kind: 'open_artifact',
          label: '打开模拟面试',
          artifact_id: 'artifact-mock-interview',
          view_mode: 'immersive',
        },
      ],
      created_at: '2026-04-10T08:04:00Z',
    }, 'thread-001');

    expect(message.actions).toBeUndefined();
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

  it('normalizes supported image and video media while dropping unsafe media URLs', () => {
    const message = normalizeThreadMessage({
      id: 'message-006',
      role: 'assistant',
      content: '这里带有多模态附件。',
      media: [
        {
          id: 'image-001',
          kind: 'image',
          url: '/mock-media/test_image.png',
          title: '测试图片',
          caption: '用于验证图片显示。',
          mime_type: 'image/png',
        },
        {
          id: 'video-001',
          type: 'video',
          src: 'FILE:///tmp/test_video.mp4',
          title: '不应展示的本地视频',
        },
        {
          id: 'image-unsafe-script',
          type: 'image',
          src: 'javascript:alert(1)',
        },
        {
          id: 'image-unsafe-data',
          type: 'image',
          src: 'data:image/svg+xml,<svg></svg>',
        },
        {
          id: 'image-unsafe-protocol-relative',
          type: 'image',
          src: '//example.com/image.png',
        },
        {
          id: 'video-002',
          type: 'video',
          src: '/mock-media/test_video.mp4',
          poster_url: '/mock-media/test_image.png',
          mimeType: 'video/mp4',
        },
      ],
      created_at: '2026-04-14T03:20:00Z',
    }, 'thread-006');

    expect(message.media).toEqual([
      {
        id: 'image-001',
        kind: 'image',
        url: '/mock-media/test_image.png',
        title: '测试图片',
        caption: '用于验证图片显示。',
        alt: undefined,
        mimeType: 'image/png',
        posterUrl: undefined,
      },
      {
        id: 'video-002',
        kind: 'video',
        url: '/mock-media/test_video.mp4',
        title: undefined,
        caption: undefined,
        alt: undefined,
        mimeType: 'video/mp4',
        posterUrl: '/mock-media/test_image.png',
      },
    ]);
  });

  it('merges media and attachments sources for multimodal messages', () => {
    const message = normalizeThreadMessage({
      id: 'message-007',
      role: 'assistant',
      content: '这里同时带有 media 和 attachments。',
      media: [
        {
          id: 'image-from-media',
          kind: 'image',
          url: '/mock-media/test_image.png',
        },
      ],
      attachments: [
        {
          id: 'video-from-attachments',
          kind: 'video',
          url: 'https://example.com/test_video.mp4',
        },
      ],
      created_at: '2026-04-14T03:30:00Z',
    }, 'thread-007');

    expect(message.media?.map((media) => media.id)).toEqual([
      'image-from-media',
      'video-from-attachments',
    ]);
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
