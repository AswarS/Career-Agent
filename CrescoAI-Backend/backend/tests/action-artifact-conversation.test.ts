import { describe, expect, test } from 'bun:test'
import { ConversationService } from '../src/Network/modules/conversation/conversation.service.js'
import type { ActionArtifactManifest } from '../src/artifacts/actionArtifactPublisher.js'

describe('Action artifact conversation projection', () => {
  test('keeps private HTML out of ordinary media and returns an open_artifact action', async () => {
    let createInput: Record<string, unknown> | undefined
    const artifactService = {
      async createArtifact(input: Record<string, unknown>) {
        createInput = input
        return { id: 77 }
      },
    }
    const service = new ConversationService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      artifactService as never,
      {} as never,
      {} as never,
    )
    const manifest: ActionArtifactManifest = {
      artifact_uid: '3e07f724-18e8-4a14-9ac4-b41db6f61b1a',
      artifact_type: 'baseline-assessment',
      schema_version: '1.0',
      title: 'Post-training · 能力基线评估',
      summary: '基于已有证据的保守评估。',
      canonical_path: '/workspace/action_artifacts/baseline.json',
      presentation_path: '/workspace/html_generated/baseline.html',
      render_mode: 'html',
      skill_call_id: 'skill-call-1',
      skill_name: 'baseline-assessment',
      agent_id: 'agent-1',
      session_id: 'session-1',
      user_id: '1',
      created_at: '2026-08-15T08:00:00.000Z',
    }

    const result = await (
      service as unknown as {
        persistAssistantGeneratedResources(
          userId: number,
          conversationId: string,
          messageId: string,
          resources: Array<Record<string, unknown>>,
        ): Promise<{
          media: Array<Record<string, unknown>>
          actions: Array<Record<string, unknown>>
        }>
      }
    ).persistAssistantGeneratedResources(1, 'conversation-1', 'message-1', [
      {
        id: 'asset-1',
        kind: 'html',
        url: '/api/career-agent/generated/user-1/html/baseline.html',
        title: manifest.title,
        storage_path: manifest.presentation_path,
        actionArtifact: manifest,
      },
    ])

    expect(result.media).toEqual([])
    expect(result.actions).toEqual([
      expect.objectContaining({
        kind: 'open_artifact',
        artifact_id: '77',
        artifactId: '77',
      }),
    ])
    expect(createInput).toMatchObject({
      type: 'baseline-assessment',
      renderMode: 'html',
      storagePath: manifest.presentation_path,
      url: undefined,
      payloadPath: undefined,
    })
  })
})
