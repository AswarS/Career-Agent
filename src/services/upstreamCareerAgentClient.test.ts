import { describe, expect, it, vi } from 'vitest';
import type { AxiosInstance } from 'axios';
import { createUpstreamCareerAgentClient } from './upstreamCareerAgentClient';

function createHttpClient(request: ReturnType<typeof vi.fn>) {
  return {
    request,
  } as unknown as AxiosInstance;
}

describe('createUpstreamCareerAgentClient', () => {
  it('requests the artifact catalog and normalizes the response', async () => {
    const request = vi.fn(async () => ({
      data: [
      {
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
      },
    ],
    }));

    const client = createUpstreamCareerAgentClient({
      baseUrl: 'https://agent.example.com',
      userId: '1',
      httpClient: createHttpClient(request),
    });

    const artifacts = await client.listArtifacts();

    expect(request).toHaveBeenCalledWith({
      url: '/api/career-agent/artifacts/1',
    });
    expect(artifacts[0]?.status).toBe('loading');
  });

  it('returns null when an optional artifact endpoint responds with 404', async () => {
    const request = vi.fn(async (config: { url: string }) => {
      if (config.url === '/api/career-agent/artifacts/1') {
        return { data: [] };
      }

      throw {
        isAxiosError: true,
        message: 'Not Found',
        response: {
          status: 404,
        },
      };
    });
    const client = createUpstreamCareerAgentClient({
      baseUrl: 'https://agent.example.com',
      userId: '1',
      httpClient: createHttpClient(request),
    });

    await expect(client.getArtifact('missing-artifact')).resolves.toBeNull();
    await expect(client.refreshArtifact('missing-artifact')).resolves.toBeNull();
  });

  it('falls back to the user-scoped artifact catalog when artifact detail does not match', async () => {
    const request = vi.fn(async (config: { url: string }) => {
      if (config.url === '/api/career-agent/artifacts/artifact-weekly-plan') {
        return {
          data: [
            {
              id: 1,
              title: 'Wrong uid list payload',
              status: 'ready',
              renderMode: 'html',
              payload: {
                html: '<div>wrong</div>',
              },
            },
          ],
        };
      }

      return {
        data: [
          {
            id: 'artifact-weekly-plan',
            type: 'weekly-plan',
            title: 'Weekly Plan',
            status: 'ready',
            renderMode: 'html',
            payload: {
              html: '<div>right</div>',
            },
          },
        ],
      };
    });
    const client = createUpstreamCareerAgentClient({
      baseUrl: 'https://agent.example.com',
      userId: '1',
      httpClient: createHttpClient(request),
    });

    const artifact = await client.getArtifact('artifact-weekly-plan');

    expect(request).toHaveBeenCalledWith({
      url: '/api/career-agent/artifacts/artifact-weekly-plan',
    });
    expect(request).toHaveBeenCalledWith({
      url: '/api/career-agent/artifacts/1',
    });
    expect(artifact?.title).toBe('Weekly Plan');
  });

  it('requests the user-scoped thread catalog with the configured user id', async () => {
    const request = vi.fn(async () => ({
      data: [
      {
        id: 1,
        userId: 7,
        title: '问好',
        preview: '你好',
        updatedAt: 1776644879000,
        createdAt: 1776644820000,
      },
    ],
    }));
    const client = createUpstreamCareerAgentClient({
      baseUrl: 'https://agent.example.com',
      userId: '7',
      httpClient: createHttpClient(request),
    });

    const threads = await client.listThreads();

    expect(request).toHaveBeenCalledWith({
      url: '/api/career-agent/threads/7',
    });
    expect(threads[0]).toEqual({
      id: '1',
      title: '问好',
      preview: '你好',
      updatedAt: new Date(1776644879000).toISOString(),
      status: 'active',
    });
  });

  it('creates a thread with the configured user id', async () => {
    const request = vi.fn(async () => ({
      data: {
        id: 2,
        userId: 1,
        title: '新对话',
        preview: '',
        updatedAt: 1776644879000,
        createdAt: 1776644820000,
      },
    }));
    const client = createUpstreamCareerAgentClient({
      baseUrl: 'https://agent.example.com',
      userId: '1',
      httpClient: createHttpClient(request),
    });

    const thread = await client.createThread({ title: '新对话' });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/career-agent/threads',
      method: 'POST',
      data: expect.objectContaining({
        userId: 1,
        title: '新对话',
      }),
    }));
    expect(thread.id).toBe('2');
  });

  it('uploads a file with the backend direct upload endpoint', async () => {
    const request = vi.fn(async () => ({
      data: {
        asset_id: 'asset-123',
        kind: 'file',
        url: '/api/career-agent/threads/12/files/resume.pdf',
        title: 'resume.pdf',
        mime_type: 'application/pdf',
        size_bytes: 245991,
        created_at: '2026-04-26T10:05:00.000Z',
        storage_path: '/api/career-agent/threads/12/files/resume.pdf',
        stored_file_name: 'resume.pdf',
        original_name: 'resume.pdf',
      },
    }));
    const client = createUpstreamCareerAgentClient({
      baseUrl: 'https://agent.example.com',
      userId: '1',
      httpClient: createHttpClient(request),
    });

    const uploadedFile = await client.uploadThreadFile('12', new File(['hello'], 'resume.pdf', {
      type: 'application/pdf',
    }));

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/career-agent/threads/12/files',
      method: 'POST',
      data: expect.any(FormData),
    }));
    expect(uploadedFile).toMatchObject({
      assetId: 'asset-123',
      title: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 245991,
    });
  });

  it('fails upload when a draft attachment blob url cannot be read', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);
    const request = vi.fn();
    const client = createUpstreamCareerAgentClient({
      baseUrl: 'https://agent.example.com',
      userId: '1',
      httpClient: createHttpClient(request),
    });

    await expect(client.uploadThreadFile('12', {
      id: 'local-file',
      kind: 'file',
      name: 'resume.pdf',
      url: 'blob:http://localhost/missing',
      mimeType: 'application/pdf',
      sizeBytes: 1,
    })).rejects.toThrow('Failed to fetch attachment "resume.pdf" (404 Not Found).');
    expect(request).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('reads a draft attachment blob before direct upload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['hello'], { type: 'text/plain' }),
    } as Response);
    const request = vi.fn(async () => ({
      data: {
        asset_id: 'asset-123',
        kind: 'file',
        url: '/api/career-agent/threads/12/files/note.txt',
        title: 'note.txt',
        mime_type: 'text/plain',
        size_bytes: 5,
      },
    }));
    const client = createUpstreamCareerAgentClient({
      baseUrl: 'https://agent.example.com',
      userId: '1',
      httpClient: createHttpClient(request),
    });

    await expect(client.uploadThreadFile('12', {
      id: 'local-file',
      kind: 'file',
      name: 'note.txt',
      url: 'blob:http://localhost/note',
      mimeType: 'text/plain',
      sizeBytes: 5,
    })).resolves.toMatchObject({
      assetId: 'asset-123',
      title: 'note.txt',
    });
    expect(fetchSpy).toHaveBeenCalledWith('blob:http://localhost/note');
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/career-agent/threads/12/files',
      method: 'POST',
    }));

    fetchSpy.mockRestore();
  });

  it('sends a message with attachment asset ids and normalizes the acknowledgement', async () => {
    const request = vi.fn(async () => ({
      data: {
        accepted: true,
        message_id: 'message-user-101',
        assistant_message_id: 'message-assistant-102',
        status: 'done',
      },
    }));
    const client = createUpstreamCareerAgentClient({
      baseUrl: 'https://agent.example.com',
      userId: '1',
      httpClient: createHttpClient(request),
    });

    const result = await client.sendMessage('12', {
      kind: 'markdown',
      content: '请分析附件',
      attachmentAssetIds: ['asset-123'],
      clientRequestId: 'req-client-001',
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/career-agent/threads/12/messages',
      method: 'POST',
      data: {
        kind: 'markdown',
        content: '请分析附件',
        attachment_asset_ids: ['asset-123'],
        client_request_id: 'req-client-001',
        context: undefined,
      },
    }));
    expect(result).toEqual({
      accepted: true,
      messageId: 'message-user-101',
      assistantMessageId: 'message-assistant-102',
      status: 'done',
    });
  });

  it('treats missing optional profile and artifact endpoints as empty optional capabilities', async () => {
    const request = vi.fn(async () => {
      throw {
        isAxiosError: true,
        message: 'Not Found',
        response: {
          status: 404,
        },
      };
    });
    const client = createUpstreamCareerAgentClient({
      baseUrl: 'https://agent.example.com',
      userId: '1',
      httpClient: createHttpClient(request),
    });

    await expect(client.listArtifacts()).resolves.toEqual([]);
    await expect(client.listProfileSuggestions()).resolves.toEqual([]);
    await expect(client.getProfile()).resolves.toMatchObject({
      locale: 'zh-CN',
      timezone: 'Asia/Singapore',
    });
  });

  it('includes backend error codes and request ids in upstream errors', async () => {
    const request = vi.fn(async () => {
      throw {
        isAxiosError: true,
        message: 'Bad Request',
        response: {
          status: 400,
          data: {
            code: 'PROFILE_VALIDATION_FAILED',
            message: 'invalid profile',
            request_id: 'req-123',
          },
        },
      };
    });
    const client = createUpstreamCareerAgentClient({
      baseUrl: 'https://agent.example.com',
      userId: '1',
      httpClient: createHttpClient(request),
    });

    await expect(client.updateProfile({
      displayName: '',
      locale: 'zh-CN',
      timezone: 'Asia/Singapore',
      currentRole: '',
      employmentStatus: '',
      experienceSummary: '',
      educationSummary: '',
      locationRegion: '',
      targetRole: '',
      targetIndustries: [],
      shortTermGoal: '',
      longTermGoal: '',
      weeklyTimeBudget: '',
      constraints: [],
      workPreferences: [],
      learningPreferences: [],
      keyStrengths: [],
      riskSignals: [],
      portfolioLinks: [],
    })).rejects.toThrow('code=PROFILE_VALIDATION_FAILED, request_id=req-123');
  });
});
