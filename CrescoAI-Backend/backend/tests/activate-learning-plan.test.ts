import { describe, expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ToolUseContext } from '../src/Tool.js'
import { publishActionArtifact } from '../src/artifacts/actionArtifactPublisher.js'
import { learningStateService } from '../src/learning/learningStateService.js'
import { ActivateLearningPlanTool } from '../src/tools/ActivateLearningPlanTool/ActivateLearningPlanTool.js'

const completion = { skill_call_id: 'call-plan', skill_name: 'learning-plan', agent_id: 'agent-plan',
  outcome: 'success' as const, summary: 'done', result: {}, completed_at: '2026-08-20T10:00:00.000Z' }
const canonical = { schema_version: '1.0', artifact_type: 'LearningPlan', created_at: '2026-08-20T10:00:00.000Z',
  lineage: { skill_call_id: 'call-plan', skill_name: 'learning-plan', agent_id: 'agent-plan' },
  plan: { version: 1, updated_at: '2026-08-20T10:00:00.000Z',
    planning_constraints: { available_time_per_week: '8 hours', deadline: null },
    stages: [{ id: 'stage-1' }, { id: 'stage-2' }] } }
const adapter = { artifactType: 'LearningPlan', artifactSlug: 'learning-plan', schemaVersion: '1.0',
  toCanonical: () => canonical, render: () => ({ title: 'Plan', summary: 'Plan', renderMode: 'html' as const, html: '<p>Plan</p>' }) }

function context(workspaceDir: string, userId = 'user1'): ToolUseContext {
  return { actionArtifactRuntime: { workspaceDir, sessionId: 'session-1', userId } } as unknown as ToolUseContext
}

describe('ActivateLearningPlan', () => {
  test('creates, focuses, and idempotently returns the same logical plan', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'activate-plan-'))
    const publication = await publishActionArtifact({ completion, adapter, workspaceDir: workspace, sessionId: 'session-1', userId: 'user1' })
    const first = await ActivateLearningPlanTool.call({ plan_ref: publication!.artifact_ref }, context(workspace), async () => ({ behavior: 'allow', updatedInput: {} }))
    const second = await ActivateLearningPlanTool.call({ plan_ref: publication!.artifact_ref }, context(workspace), async () => ({ behavior: 'allow', updatedInput: {} }))
    expect(first.data.activation_status).toBe('created')
    expect(second.data.activation_status).toBe('already_active')
    expect(second.data.plan_id).toBe(first.data.plan_id)
    expect((await learningStateService.getUserState(workspace)).version).toBe(1)
  })
  test('rejects another user and reactivates paused state without losing progress', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'activate-plan-'))
    const publication = await publishActionArtifact({ completion, adapter, workspaceDir: workspace, sessionId: 'session-1', userId: 'user1' })
    await expect(ActivateLearningPlanTool.call({ plan_ref: publication!.artifact_ref }, context(workspace, 'user2'), async () => ({ behavior: 'allow', updatedInput: {} }))).rejects.toThrow()
    const first = await ActivateLearningPlanTool.call({ plan_ref: publication!.artifact_ref }, context(workspace), async () => ({ behavior: 'allow', updatedInput: {} }))
    await learningStateService.updatePlanState(workspace, first.data.plan_id, plan => ({ ...plan, status: 'paused', completed_stage_ids: ['stage-0'] }))
    const result = await ActivateLearningPlanTool.call({ plan_ref: publication!.artifact_ref }, context(workspace), async () => ({ behavior: 'allow', updatedInput: {} }))
    expect(result.data.activation_status).toBe('reactivated')
    expect((await learningStateService.getPlanState(workspace, first.data.plan_id))?.completed_stage_ids).toEqual(['stage-0'])
  })
})
