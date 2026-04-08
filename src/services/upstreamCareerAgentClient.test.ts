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
      fetcher: fetcher as unknown as typeof fetch,
    });

    await expect(client.getArtifact('missing-artifact')).resolves.toBeNull();
    await expect(client.refreshArtifact('missing-artifact')).resolves.toBeNull();
  });
});
