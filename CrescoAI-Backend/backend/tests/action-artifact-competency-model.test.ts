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
import { createCareerCompetencyModelArtifactAdapter } from '../src/tools/CareerCompetencyModelTool/artifactAdapter.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })),
  )
})

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'competency-model-artifact-'))
  temporaryRoots.push(root)
  return root
}

const MODEL_FILE_NAME = 'career_competency_model_llm-agent_2026-08-15.json'

const skillModel = {
  schema_version: '1.0',
  artifact_type: 'CareerCompetencyModel',
  created_at: '2026-08-15T08:00:00.000Z',
  target: {
    role: 'LLM Agent 工程师',
    industry: '人工智能',
    region: null,
    seniority: '中级',
    specialization: null,
    scope_notes: ['聚焦 Agent 应用开发。'],
  },
  methodology: {
    as_of: '2026-08-15',
    research_summary: '综合了多来源岗位要求与雇主材料。',
    source_mix: ['job_posting', 'employer'],
  },
  requirements: [
    {
      id: 'req-1',
      category: 'skill',
      statement: '能够实现带工具调用的 Agent workflow。',
      source_refs: ['src-1'],
    },
    {
      id: 'req-2',
      category: 'tool',
      statement: '熟悉 LangGraph 或同类编排框架。',
      source_refs: ['src-1'],
    },
  ],
  job_tasks: [
    {
      id: 'task-1',
      name: 'Agent 服务编排',
      description: '设计并实现多步工具调用的 Agent 服务。',
      source_refs: ['src-1'],
    },
  ],
  competency_domains: [
    {
      id: 'domain-1',
      name: 'Agent 系统开发',
      definition: '构建可靠的多步 Agent 应用。',
      competencies: [
        {
          id: 'competency-1',
          name: 'Workflow 编排',
          definition: '把模型调用与工具执行组织成可观测的流程。',
          importance: 'core',
          expected_depth: 'independent',
          requirement_refs: ['req-1'],
          related_job_task_refs: ['task-1'],
          evidence_refs: ['src-1'],
        },
      ],
    },
  ],
  relationships: [
    {
      from_competency_ref: 'competency-1',
      to_competency_ref: 'competency-2',
      type: 'prerequisite',
      rationale: '先掌握基础编排。',
    },
  ],
  sources: [
    {
      id: 'src-1',
      title: 'Example Co 岗位要求',
      url: 'https://example.com/jd',
      publisher: 'Example Co',
      source_type: 'job_posting',
      published_or_updated_at: '2026-07-01',
      accessed_at: '2026-08-15',
      relevance: '直接描述岗位要求。',
    },
  ],
  limitations: ['仅覆盖公开材料。'],
}

function successCompletion(
  result: Record<string, unknown>,
): ActionCompletionForArtifact {
  return {
    skill_call_id: 'skill-call-1',
    skill_name: 'career-competency-model',
    agent_id: 'agent-1',
    outcome: 'success',
    summary: '完成 LLM Agent 工程师岗位能力模型。',
    completed_at: '2026-08-15T08:05:00.000Z',
    result,
  }
}

async function writeSkillModel(
  workspaceDir: string,
  model: Record<string, unknown>,
): Promise<void> {
  await writeFile(
    join(workspaceDir, MODEL_FILE_NAME),
    JSON.stringify(model, null, 2),
    'utf8',
  )
}

describe('CareerCompetencyModel Action artifact publication', () => {
  test('reads the skill-written model, publishes a rendered HTML view, and a discoverable manifest', async () => {
    const workspaceDir = await createWorkspace()
    await writeSkillModel(workspaceDir, skillModel)

    const publication = await publishActionArtifact({
      completion: successCompletion({
        artifact: {
          type: 'CareerCompetencyModel',
          path: MODEL_FILE_NAME,
          format: 'json',
          schema_version: '1.0',
        },
        target: { role: 'LLM Agent 工程师' },
        counts: { domains: 1, competencies: 1, requirements: 2, job_tasks: 1, sources: 1 },
        limitations: ['仅覆盖公开材料。'],
      }),
      adapter: createCareerCompetencyModelArtifactAdapter(workspaceDir),
      workspaceDir,
      sessionId: 'session-1',
      userId: 'user-1',
    })

    expect(publication?.status).toBe('ready')
    expect(publication?.render_mode).toBe('html')

    const canonical = JSON.parse(
      await readFile(publication!.canonical_path!, 'utf8'),
    )
    expect(canonical.artifact_type).toBe('CareerCompetencyModel')
    expect(canonical.lineage.skill_call_id).toBe('skill-call-1')
    expect(canonical.model.target.role).toBe('LLM Agent 工程师')

    const html = await readFile(publication!.presentation_path!, 'utf8')
    expect(html).toContain('岗位能力模型')
    expect(html).toContain('Agent 系统开发')
    expect(html).toContain('Workflow 编排')
    expect(html).toContain('Example Co')

    const manifest = await readActionArtifactManifest(
      publication!.presentation_path!,
      workspaceDir,
    )
    expect(manifest).toMatchObject({
      artifact_uid: publication?.artifact_uid,
      artifact_type: 'career-competency-model',
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

  test('escapes model-produced content in the HTML presentation', async () => {
    const workspaceDir = await createWorkspace()
    await writeSkillModel(workspaceDir, {
      ...skillModel,
      competency_domains: [
        {
          id: 'domain-1',
          name: '<script>window.pwned = true</script>',
          definition: '定义。',
          competencies: [
            {
              id: 'competency-1',
              name: '编排',
              definition: '定义。',
              importance: 'core',
              expected_depth: 'working',
              requirement_refs: ['req-1'],
              related_job_task_refs: ['task-1'],
              evidence_refs: ['src-1'],
            },
          ],
        },
      ],
    })

    const publication = await publishActionArtifact({
      completion: successCompletion({
        artifact: {
          type: 'CareerCompetencyModel',
          path: MODEL_FILE_NAME,
          format: 'json',
          schema_version: '1.0',
        },
      }),
      adapter: createCareerCompetencyModelArtifactAdapter(workspaceDir),
      workspaceDir,
      sessionId: 'session-escape',
    })

    expect(publication?.status).toBe('ready')
    const html = await readFile(publication!.presentation_path!, 'utf8')
    expect(html).not.toContain('<script>window.pwned = true</script>')
    expect(html).toContain('&lt;script&gt;window.pwned = true&lt;/script&gt;')
  })

  test('rejects a skill result whose artifact path escapes the workspace', async () => {
    const workspaceDir = await createWorkspace()
    const outsideDir = await createWorkspace()
    await writeSkillModel(outsideDir, skillModel)

    const publication = await publishActionArtifact({
      completion: successCompletion({
        artifact: {
          type: 'CareerCompetencyModel',
          path: join(outsideDir, MODEL_FILE_NAME),
          format: 'json',
          schema_version: '1.0',
        },
      }),
      adapter: createCareerCompetencyModelArtifactAdapter(workspaceDir),
      workspaceDir,
      sessionId: 'session-escape-path',
    })

    expect(publication?.status).toBe('error')
    expect(await discoverGeneratedFiles(workspaceDir, 0)).toEqual([])
  })

  test('rejects a missing artifact path', async () => {
    const workspaceDir = await createWorkspace()

    const publication = await publishActionArtifact({
      completion: successCompletion({ counts: { domains: 0 } }),
      adapter: createCareerCompetencyModelArtifactAdapter(workspaceDir),
      workspaceDir,
      sessionId: 'session-missing-path',
    })

    expect(publication?.status).toBe('error')
  })
})
