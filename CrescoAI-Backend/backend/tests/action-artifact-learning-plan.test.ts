import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  publishActionArtifact,
  readActionArtifactManifest,
  type ActionCompletionForArtifact,
} from '../src/artifacts/actionArtifactPublisher.js'
import { discoverGeneratedFiles } from '../src/Network/modules/agent/generated-output-discovery.js'
import { createLearningPlanArtifactAdapter } from '../src/tools/LearningPlanTool/artifactAdapter.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })),
  )
})

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'learning-plan-artifact-'))
  temporaryRoots.push(root)
  return root
}

const PLAN_FILE_NAME = 'learning_plan_llm-agent_2026-08-16.json'

const skillPlan = {
  schema_version: '1.0',
  artifact_type: 'LearningPlan',
  created_at: '2026-08-16T08:00:00.000Z',
  lineage: {
    model_ref: 'action_artifacts/career-competency-model-<uid>.json',
    model_as_of: '2026-08-15',
    baseline_ref: 'action_artifacts/baseline-assessment-<uid>.json',
    baseline_completed_at: '2026-08-15T09:00:00.000Z',
    validation: {
      target_correspondence: '模型目标与基线评估目标一致（LLM Agent 工程师）。',
      freshness_judgment: '两个产物均为近期生成，未发现用户情况发生实质变化。',
      notes: ['无。'],
    },
  },
  target: {
    role: 'LLM Agent 工程师',
    industry: '人工智能',
    region: null,
    seniority: '中级',
    specialization: null,
  },
  goal_level: null,
  baseline_summary: {
    overall_level: 'applied',
    overall_confidence: 'medium',
    coverage_note: '覆盖了大部分核心能力，少数维度缺乏证据。',
  },
  prioritized_gaps: [
    {
      competency_ref: 'competency-1',
      competency_name: 'Workflow 编排',
      domain_ref: 'domain-1',
      importance: 'core',
      expected_depth: 'independent',
      target_depth: 'independent',
      current_level: 'applied',
      gap: 'shallow',
      delta: 1,
      priority: 1,
      prerequisites: [],
      rationale: '已能完成常规编排，但复杂多步场景仍需独立推进。',
    },
    {
      competency_ref: 'competency-2',
      competency_name: '可观测性与评估',
      domain_ref: 'domain-1',
      importance: 'important',
      expected_depth: 'working',
      target_depth: 'working',
      current_level: null,
      gap: 'missing',
      delta: 2,
      priority: 2,
      prerequisites: [],
      rationale: '基线中没有任何与该能力相关的证据。',
    },
  ],
  stages: [
    {
      id: 'stage-1',
      name: 'Core',
      goal: '补齐核心差距并夯实常规场景的独立执行。',
      competency_refs: ['competency-1', 'competency-2'],
      expected_level_after: 'independent',
      estimated_duration: {
        value: '4-6 周',
        basis: 'from_user_constraints',
      },
      depends_on: [],
      rationale: '用户每周 10 小时，按期限倒推。',
    },
    {
      id: 'stage-2',
      name: 'Job-ready',
      goal: '在真实或接近真实的场景中巩固独立水平。',
      competency_refs: ['competency-1'],
      expected_level_after: 'independent',
      estimated_duration: {
        value: '2-3 周',
        basis: 'estimate',
      },
      depends_on: ['stage-1'],
      rationale: '巩固与验证。',
    },
  ],
  assumptions: ['用户每周可投入 10 小时，期限 2027-02-15。'],
  limitations: ['基线部分维度证据不足，个别映射为语义近似。'],
}

function successCompletion(
  result: Record<string, unknown>,
): ActionCompletionForArtifact {
  return {
    skill_call_id: 'skill-call-1',
    skill_name: 'learning-plan',
    agent_id: 'agent-1',
    outcome: 'success',
    summary: '完成 LLM Agent 工程师学习计划。',
    completed_at: '2026-08-16T08:05:00.000Z',
    result,
  }
}

async function writeSkillPlan(
  workspaceDir: string,
  plan: Record<string, unknown>,
): Promise<void> {
  await writeFile(
    join(workspaceDir, PLAN_FILE_NAME),
    JSON.stringify(plan, null, 2),
    'utf8',
  )
}

describe('LearningPlan Action artifact publication', () => {
  test('reads the skill-written plan, publishes a rendered HTML view, and a discoverable manifest', async () => {
    const workspaceDir = await createWorkspace()
    await writeSkillPlan(workspaceDir, skillPlan)

    const publication = await publishActionArtifact({
      completion: successCompletion({
        artifact: {
          type: 'LearningPlan',
          path: PLAN_FILE_NAME,
          format: 'json',
          schema_version: '1.0',
        },
        target: { role: 'LLM Agent 工程师' },
        counts: { gaps: 2, stages: 2 },
        limitations: ['基线部分维度证据不足，个别映射为语义近似。'],
      }),
      adapter: createLearningPlanArtifactAdapter(workspaceDir),
      workspaceDir,
      sessionId: 'session-1',
      userId: 'user-1',
    })

    expect(publication?.status).toBe('ready')
    expect(publication?.render_mode).toBe('html')

    const canonical = JSON.parse(
      await readFile(publication!.canonical_path!, 'utf8'),
    )
    expect(canonical.artifact_type).toBe('LearningPlan')
    expect(canonical.lineage.skill_call_id).toBe('skill-call-1')
    expect(canonical.plan.target.role).toBe('LLM Agent 工程师')
    expect(canonical.plan.prioritized_gaps).toHaveLength(2)
    expect(canonical.plan.stages).toHaveLength(2)

    const html = await readFile(publication!.presentation_path!, 'utf8')
    expect(html).toContain('学习计划')
    expect(html).toContain('Workflow 编排')
    expect(html).toContain('优先差距')
    expect(html).toContain('学习阶段')
    expect(html).toContain('深度不足')
    expect(html).toContain('缺失（需从头建立）')
    expect(html).toContain('按用户约束')

    const manifest = await readActionArtifactManifest(
      publication!.presentation_path!,
      workspaceDir,
    )
    expect(manifest).toMatchObject({
      artifact_uid: publication?.artifact_uid,
      artifact_type: 'learning-plan',
      session_id: 'session-1',
      user_id: 'user-1',
      render_mode: 'html',
    })

    const discovered = await discoverGeneratedFiles(workspaceDir, 0)
    expect(discovered).toHaveLength(1)
    expect(discovered[0]?.actionArtifact?.artifact_uid).toBe(
      publication?.artifact_uid,
    )
  })

  test('escapes plan-produced content in the HTML presentation', async () => {
    const workspaceDir = await createWorkspace()
    await writeSkillPlan(workspaceDir, {
      ...skillPlan,
      prioritized_gaps: [
        {
          competency_ref: 'competency-1',
          competency_name: '<script>window.pwned = true</script>',
          domain_ref: 'domain-1',
          importance: 'core',
          expected_depth: 'independent',
          target_depth: 'independent',
          current_level: 'applied',
          gap: 'shallow',
          delta: 1,
          priority: 1,
          prerequisites: [],
          rationale: '<img src=x onerror=alert(1)>',
        },
      ],
    })

    const publication = await publishActionArtifact({
      completion: successCompletion({
        artifact: {
          type: 'LearningPlan',
          path: PLAN_FILE_NAME,
          format: 'json',
          schema_version: '1.0',
        },
        target: { role: 'LLM Agent 工程师' },
        counts: { gaps: 1, stages: 2 },
        limitations: [],
      }),
      adapter: createLearningPlanArtifactAdapter(workspaceDir),
      workspaceDir,
      sessionId: 'session-1',
      userId: 'user-1',
    })

    expect(publication?.status).toBe('ready')
    const html = await readFile(publication!.presentation_path!, 'utf8')
    expect(html).not.toContain('<script>window.pwned = true</script>')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;script&gt;window.pwned = true&lt;/script&gt;')
  })

  test('reports canonical_only when the HTML presentation step fails', async () => {
    const workspaceDir = await createWorkspace()
    await writeSkillPlan(workspaceDir, skillPlan)

    const adapter = createLearningPlanArtifactAdapter(workspaceDir)
    const publication = await publishActionArtifact({
      completion: successCompletion({
        artifact: {
          type: 'LearningPlan',
          path: PLAN_FILE_NAME,
          format: 'json',
          schema_version: '1.0',
        },
        target: { role: 'LLM Agent 工程师' },
        counts: { gaps: 2, stages: 2 },
        limitations: [],
      }),
      adapter: {
        ...adapter,
        render() {
          throw new Error('render failed')
        },
      },
      workspaceDir,
      sessionId: 'session-1',
      userId: 'user-1',
    })

    expect(publication?.status).toBe('canonical_only')
    expect(publication?.presentation_path).toBeUndefined()
    const canonical = JSON.parse(
      await readFile(publication!.canonical_path!, 'utf8'),
    )
    expect(canonical.artifact_type).toBe('LearningPlan')
  })

  test('returns error status when the skill result has no artifact path', async () => {
    const workspaceDir = await createWorkspace()

    const publication = await publishActionArtifact({
      completion: successCompletion({ target: { role: 'LLM Agent 工程师' } }),
      adapter: createLearningPlanArtifactAdapter(workspaceDir),
      workspaceDir,
      sessionId: 'session-1',
      userId: 'user-1',
    })

    expect(publication?.status).toBe('error')
    expect(publication?.canonical_path).toBeUndefined()
  })

  test('returns error status when the plan file fails canonical validation', async () => {
    const workspaceDir = await createWorkspace()
    await writeSkillPlan(workspaceDir, {
      ...skillPlan,
      prioritized_gaps: [
        {
          competency_ref: 'competency-1',
          competency_name: 'Workflow 编排',
          domain_ref: 'domain-1',
          importance: 'core',
          expected_depth: 'independent',
          target_depth: 'independent',
          current_level: 'applied',
          gap: 'not-a-real-category',
          delta: 1,
          priority: 1,
          prerequisites: [],
          rationale: 'invalid gap category',
        },
      ],
    })

    const publication = await publishActionArtifact({
      completion: successCompletion({
        artifact: {
          type: 'LearningPlan',
          path: PLAN_FILE_NAME,
          format: 'json',
          schema_version: '1.0',
        },
        target: { role: 'LLM Agent 工程师' },
        counts: { gaps: 1, stages: 2 },
        limitations: [],
      }),
      adapter: createLearningPlanArtifactAdapter(workspaceDir),
      workspaceDir,
      sessionId: 'session-1',
      userId: 'user-1',
    })

    expect(publication?.status).toBe('error')
  })
})
