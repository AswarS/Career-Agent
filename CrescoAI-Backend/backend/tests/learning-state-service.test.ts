import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LearningStateError, LearningStateService, getLearningStatePath } from '../src/learning/learningStateService.js'

const uid = '123e4567-e89b-42d3-a456-426614174000'
const plan = { plan_id: 'lp_test', plan_ref: `artifact://${uid}`, plan_artifact_uid: uid,
  status: 'active' as const, current_stage_id: 'stage-1', current_stage_status: 'not_started' as const,
  completed_stage_ids: [], current_stage_package_ref: null, latest_assessment_ref: null,
  activated_at: '2026-08-20T10:00:00.000Z', updated_at: '2026-08-20T10:00:00.000Z' }

describe('LearningStateService', () => {
  test('returns empty state without creating a file', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'learning-state-'))
    const service = new LearningStateService()
    expect(await service.getUserState(workspace)).toEqual({ schema_version: '1.0', version: 0, focus_plan_id: null, plans: [] })
    await expect(stat(getLearningStatePath(workspace))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  test('serializes concurrent writes, increments versions, and validates focus', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'learning-state-'))
    const service = new LearningStateService()
    await service.addPlanState(workspace, plan)
    const [a, b] = await Promise.all([
      service.updatePlanState(workspace, plan.plan_id, value => ({ ...value, status: 'paused' })),
      service.setFocusPlan(workspace, plan.plan_id),
    ])
    const final = await service.getUserState(workspace)
    expect(final.version).toBe(3)
    expect(final.focus_plan_id).toBe(plan.plan_id)
    expect(JSON.parse(await readFile(getLearningStatePath(workspace), 'utf8')).version).toBe(3)
  })
  test('rejects duplicate plans and a focus pointing at no plan', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'learning-state-'))
    const service = new LearningStateService()
    await service.addPlanState(workspace, plan)
    await expect(service.addPlanState(workspace, plan)).rejects.toBeInstanceOf(LearningStateError)
    await expect(service.setFocusPlan(workspace, 'missing')).rejects.toMatchObject({ code: 'INVALID_LEARNING_STATE' })
  })
})
