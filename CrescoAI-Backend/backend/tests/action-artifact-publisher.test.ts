import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  publishActionArtifact,
  readActionArtifactManifest,
  type ActionCompletionForArtifact,
} from '../src/artifacts/actionArtifactPublisher.js'
import { discoverGeneratedFiles } from '../src/Network/modules/agent/generated-output-discovery.js'
import { BaselineAssessmentArtifactAdapter } from '../src/tools/BaselineAssessmentTool/artifactAdapter.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })),
  )
})

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'baseline-artifact-'))
  temporaryRoots.push(root)
  return root
}

function successCompletion(
  capabilityAssessment = '能够独立实现并验证基础 Agent workflow。',
): ActionCompletionForArtifact {
  return {
    skill_call_id: 'skill-call-1',
    skill_name: 'baseline-assessment',
    agent_id: 'agent-1',
    outcome: 'success',
    summary: '现有证据支持 applied 水平，置信度为 medium。',
    completed_at: '2026-08-15T08:00:00.000Z',
    result: {
      assessment_target: {
        name: 'LLM Agent 工程师',
        basis: 'explicit',
        scope: '面向生产环境的 Agent 系统开发',
      },
      framework: {
        source: 'provided',
        summary: '依据已有职业能力模型评估。',
      },
      overall: {
        level: 'applied',
        confidence: 'medium',
        summary: '具备 Agent workflow 的实践证据。',
      },
      capabilities: [
        {
          dimension: 'Agent workflow 实现',
          level: 'applied',
          confidence: 'medium',
          evidence_basis: ['demonstrated'],
          evidence: [
            {
              summary: '实现过带工具调用的 Agent workflow。',
              source_type: 'artifact',
              source_ref: 'project-agent-eval',
            },
          ],
          assessment: capabilityAssessment,
        },
      ],
      unknowns: [{ dimension: '线上可靠性', reason: '上下文中没有运行指标。' }],
      conflicts: [],
      limitations: ['只使用调用前已有证据。'],
    },
  }
}

describe('BaselineAssessment Action artifact publication', () => {
  test('writes canonical JSON, a dedicated HTML view, and a discoverable manifest', async () => {
    const workspaceDir = await createWorkspace()
    const publication = await publishActionArtifact({
      completion: successCompletion(),
      adapter: BaselineAssessmentArtifactAdapter,
      workspaceDir,
      sessionId: 'session-1',
      userId: 'user-1',
    })

    expect(publication?.status).toBe('ready')
    expect(publication?.canonical_path).toStartWith(join(workspaceDir, 'action_artifacts'))
    expect(publication?.presentation_path).toStartWith(join(workspaceDir, 'html_generated'))

    const canonical = JSON.parse(
      await readFile(publication!.canonical_path!, 'utf8'),
    )
    expect(canonical.artifact_type).toBe('BaselineAssessment')
    expect(canonical.lineage.skill_call_id).toBe('skill-call-1')
    expect(canonical.assessment.overall.level).toBe('applied')

    const html = await readFile(publication!.presentation_path!, 'utf8')
    expect(html).toContain('能力基线评估')
    expect(html).toContain('Agent workflow 实现')

    const manifest = await readActionArtifactManifest(
      publication!.presentation_path!,
      workspaceDir,
    )
    expect(manifest).toMatchObject({
      artifact_uid: publication?.artifact_uid,
      artifact_type: 'baseline-assessment',
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
    const publication = await publishActionArtifact({
      completion: successCompletion('<script>window.pwned = true</script>'),
      adapter: BaselineAssessmentArtifactAdapter,
      workspaceDir,
      sessionId: 'session-2',
    })

    const html = await readFile(publication!.presentation_path!, 'utf8')
    expect(html).not.toContain('<script>window.pwned = true</script>')
    expect(html).toContain('&lt;script&gt;window.pwned = true&lt;/script&gt;')
  })

  test('accepts one JSON-encoded result layer from a model tool call', async () => {
    const workspaceDir = await createWorkspace()
    const completion = successCompletion()
    const publication = await publishActionArtifact({
      completion: {
        ...completion,
        result: JSON.stringify(completion.result),
      },
      adapter: BaselineAssessmentArtifactAdapter,
      workspaceDir,
      sessionId: 'session-json-string',
    })

    expect(publication?.status).toBe('ready')
    const canonical = JSON.parse(
      await readFile(publication!.canonical_path!, 'utf8'),
    )
    expect(canonical.assessment.assessment_target.name).toBe('LLM Agent 工程师')
  })

  test('does not create an artifact for insufficient input', async () => {
    const workspaceDir = await createWorkspace()
    const publication = await publishActionArtifact({
      completion: {
        ...successCompletion(),
        outcome: 'insufficient_input',
        result: {
          available_evidence: [],
          insufficiency_reasons: ['没有与目标相关的能力证据。'],
        },
      },
      adapter: BaselineAssessmentArtifactAdapter,
      workspaceDir,
      sessionId: 'session-3',
    })

    expect(publication).toBeUndefined()
    expect(await discoverGeneratedFiles(workspaceDir, 0)).toEqual([])
  })
})
