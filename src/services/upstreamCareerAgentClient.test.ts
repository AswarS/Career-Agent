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
});
