import { describe, expect, it, vi } from 'vitest';
import { createUpstreamCareerAgentClient } from './upstreamCareerAgentClient';

describe('createUpstreamCareerAgentClient', () => {
  it('requests the artifact catalog and normalizes the response', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([
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
    ]), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }));

    const client = createUpstreamCareerAgentClient({
      baseUrl: 'https://agent.example.com',
      userId: '1',
      fetcher: fetcher as unknown as typeof fetch,
    });

    const artifacts = await client.listArtifacts();

    expect(fetcher).toHaveBeenCalledWith(
      'https://agent.example.com/api/career-agent/artifacts',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      }),
    );
    expect(artifacts[0]?.status).toBe('loading');
  });

  it('returns null when an optional artifact endpoint responds with 404', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 404 }));
    const client = createUpstreamCareerAgentClient({
      baseUrl: 'https://agent.example.com',
      userId: '1',
      fetcher: fetcher as unknown as typeof fetch,
    });

    await expect(client.getArtifact('missing-artifact')).resolves.toBeNull();
    await expect(client.refreshArtifact('missing-artifact')).resolves.toBeNull();
  });

  it('requests the user-scoped thread catalog with the configured user id', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([
      {
        id: 1,
        userId: 7,
        title: '问好',
        preview: '你好',
        updatedAt: 1776644879000,
        createdAt: 1776644820000,
      },
    ]), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }));
    const client = createUpstreamCareerAgentClient({
      baseUrl: 'https://agent.example.com',
      userId: '7',
      fetcher: fetcher as unknown as typeof fetch,
    });

    const threads = await client.listThreads();

    expect(fetcher).toHaveBeenCalledWith(
      'https://agent.example.com/api/career-agent/threads/7',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      }),
    );
    expect(threads[0]).toEqual({
      id: '1',
      title: '问好',
      preview: '你好',
      updatedAt: new Date(1776644879000).toISOString(),
      status: 'active',
    });
  });
});
