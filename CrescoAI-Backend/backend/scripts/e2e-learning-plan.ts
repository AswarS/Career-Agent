/**
 * End-to-end exercise of the learning-plan skill with a real model.
 *
 * Each case builds fixture CareerCompetencyModel / BaselineAssessment canonical
 * artifacts in a temp workspace, forks the skill through the production
 * executor (real runAgent + real tools), and publishes the resulting artifact
 * through the production publisher chain.
 *
 * Run: bun run ./scripts/e2e-learning-plan.ts
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { getSkillActionCommand } from '../src/skills/skillAction.js'
import { executeForkedPromptSkill } from '../src/skills/forkedSkillExecutor.js'
import { runAgent } from '../src/tools/AgentTool/runAgent.js'
import { createServerAppState } from '../src/server/queryEngineFactory.js'
import { FileReadTool } from '../src/tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from '../src/tools/FileWriteTool/FileWriteTool.js'
import { ReturnSkillResultTool } from '../src/tools/ReturnSkillResultTool/ReturnSkillResultTool.js'
import { createUserMessage } from '../src/utils/messages.js'
import {
  createFileStateCacheWithSizeLimit,
  READ_FILE_STATE_CACHE_SIZE,
} from '../src/utils/fileStateCache.js'
import { enableConfigs } from '../src/utils/config.js'
import { setCwdState, setProjectRoot } from '../src/bootstrap/state.js'
import { registerCareerAgentSkills } from '../src/skills/bundled/careerAgent.js'
import { ensureBootstrapMacro } from '../src/bootstrapMacro.js'
import { publishActionArtifact } from '../src/artifacts/actionArtifactPublisher.js'
import { createLearningPlanArtifactAdapter } from '../src/tools/LearningPlanTool/artifactAdapter.js'
import type { ToolUseContext } from '../src/Tool.js'
import type { JsonValue } from '../src/skills/skillLifecycleTypes.js'
import type { CompletedSkillAction } from '../src/skills/forkedSkillExecutor.js'
import type { CommandBase, PromptCommand } from '../src/types/command.js'

type Expected = 'success' | 'insufficient_input'

type CaseResult = {
  id: string
  expect: Expected
  outcome: string
  summary: string
  artifactStatus?: string
  checks: Array<{ name: string; pass: boolean; detail?: string }>
}

const results: CaseResult[] = []

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function competencyModelFixture(role: string, asOf: string) {
  return {
    schema_version: '1.0',
    artifact_type: 'CareerCompetencyModel',
    created_at: `${asOf}T08:00:00.000Z`,
    lineage: { skill_call_id: 'e2e-model', skill_name: 'career-competency-model', agent_id: 'e2e-agent' },
    model: {
      schema_version: '1.0',
      artifact_type: 'CareerCompetencyModel',
      created_at: `${asOf}T08:00:00.000Z`,
      target: { role, industry: '人工智能', region: null, seniority: '中级', specialization: null, scope_notes: [] },
      methodology: { as_of: asOf, research_summary: '多来源岗位要求综合。', source_mix: ['job_posting', 'employer'] },
      requirements: [
        { id: 'req-1', category: 'skill', statement: '能够实现带工具调用的 Agent workflow。', source_refs: ['src-1'] },
        { id: 'req-2', category: 'tool', statement: '熟悉 LangGraph 或同类编排框架。', source_refs: ['src-1'] },
      ],
      job_tasks: [{ id: 'task-1', name: 'Agent 服务编排', description: '设计并实现多步工具调用的 Agent 服务。', source_refs: ['src-1'] }],
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
            {
              id: 'competency-2',
              name: '可观测性与评估',
              definition: '追踪 Agent 运行并评估质量。',
              importance: 'important',
              expected_depth: 'working',
              requirement_refs: ['req-2'],
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
          published_or_updated_at: asOf,
          accessed_at: asOf,
          relevance: '直接描述岗位要求。',
        },
      ],
      limitations: ['仅覆盖公开材料。'],
    },
  }
}

function baselineFixture(role: string, completedAt: string, workflowLevel = 'applied') {
  return {
    schema_version: '1.0',
    artifact_type: 'BaselineAssessment',
    created_at: completedAt,
    lineage: { skill_call_id: 'e2e-baseline', skill_name: 'baseline-assessment', agent_id: 'e2e-agent' },
    assessment: {
      assessment_target: { name: role, basis: 'explicit', scope: '面向该岗位的当前能力基线。' },
      framework: { source: 'provided', summary: '使用 CareerCompetencyModel 作为评估框架。' },
      overall: {
        level: workflowLevel,
        confidence: 'medium',
        summary: '具备常规 Agent 开发实践证据，复杂场景与可观测性存在明显短板。',
      },
      capabilities: [
        {
          dimension: 'Workflow 编排',
          level: workflowLevel,
          confidence: 'medium',
          evidence_basis: ['documented'],
          evidence: [{ summary: '独立完成常规 Agent workflow 开发并上线。', source_type: 'conversation', source_ref: '用户自述' }],
          assessment: '常规场景可独立完成，复杂多步场景仍需支持。',
        },
      ],
      unknowns: [{ dimension: '可观测性与评估', reason: '没有找到与该能力相关的证据。' }],
      conflicts: [],
      limitations: ['部分维度证据不足。'],
    },
  }
}

async function setupWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'learning-plan-e2e-'))
  await mkdir(join(dir, 'action_artifacts'), { recursive: true })
  await mkdir(join(dir, 'html_generated'), { recursive: true })
  return dir
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

function buildToolUseContext(workspaceDir: string, messages: any[]): ToolUseContext {
  const { getAppState, setAppState } = createServerAppState()
  const tools = [FileReadTool, FileWriteTool, ReturnSkillResultTool]

  return {
    actionArtifactRuntime: {
      workspaceDir,
      sessionId: 'e2e-session',
      userId: 'e2e-user',
    },
    messages,
    abortController: new AbortController(),
    readFileState: createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE),
    getAppState,
    setAppState,
    options: {
      commands: [],
      debug: false,
      mainLoopModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
      tools,
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: [] },
    },
  } as ToolUseContext
}

async function runCase(input: {
  id: string
  command: CommandBase & PromptCommand
  workspaceDir: string
  actionInput: JsonValue
  contextMessages: any[]
  expect: Expected
  checks?: Array<{
    name: string
    verify: (plan: any) => boolean
    detail?: (plan: any) => string
  }>
  publish?: boolean
}): Promise<void> {
  console.log(`\n=== Case: ${input.id} ===`)
  if (process.env.E2E_ONLY && process.env.E2E_ONLY !== input.id) {
    console.log('  (skipped by E2E_ONLY)')
    return
  }
  const context = buildToolUseContext(input.workspaceDir, input.contextMessages)
  // updatedInput must pass the original input through — an empty object would
  // clobber the tool call's arguments in the permission flow.
  const canUseTool = async (_tool: unknown, toolInput: Record<string, unknown>) => ({
    behavior: 'allow' as const,
    updatedInput: toolInput,
  })

  const tracingRunAgent = (async function* (input: any) {
    console.log(`  [runAgent] start — prompt chars: ${JSON.stringify(input.promptMessages).length}, availableTools: ${input.availableTools?.map((t: any) => t.name).join(',')}`)
    let count = 0
    for await (const message of runAgent(input)) {
      count += 1
      const summary = (message as any)?.message?.content?.map((block: any) =>
        block.type === 'text'
          ? `text: ${block.text.slice(0, 800)}`
          : `${block.type}:${block.name ?? ''}`,
      ).join(' | ')
      console.log(`  [runAgent] message ${count}: ${summary ?? JSON.stringify(message).slice(0, 400)}`)
      yield message
    }
    console.log(`  [runAgent] end — total messages: ${count}`)
  }) as typeof runAgent

  const execution = await executeForkedPromptSkill({
    command: input.command,
    commandName: 'learning-plan',
    actionInput: input.actionInput,
    contextMode: 'fork',
    requireCompletion: false,
    context,
    canUseTool,
    runAgentImpl: tracingRunAgent,
    onMessage: (message: any) => {
      for (const block of message.content ?? []) {
        if (block.type === 'tool_use') {
          console.log(`  [tool_use] ${block.name} ${JSON.stringify(block.input).slice(0, 300)}`)
        } else if (block.type === 'tool_result') {
          const contentText = Array.isArray(block.content)
            ? block.content.map((c: any) => c.text ?? JSON.stringify(c)).join(' ').slice(0, 200)
            : String(block.content).slice(0, 200)
          const error = block.is_error ? ' (ERROR)' : ''
          console.log(`  [tool_result]${error} ${contentText}`)
        } else if (block.type === 'text') {
          console.log(`  [text] ${block.text.slice(0, 200)}`)
        }
      }
    },
  })
  const completion = execution.completion
  if (!completion) {
    throw new Error(`Case ${input.id}: skill ended without a lifecycle completion`)
  }

  console.log(`outcome: ${completion.outcome}`)
  console.log(`summary: ${completion.summary}`)

  const checks: CaseResult['checks'] = [
    {
      name: `outcome is ${input.expect}`,
      pass: completion.outcome === input.expect,
      detail: `got ${completion.outcome}`,
    },
  ]
  let artifactStatus: string | undefined

  if (completion.outcome === 'success') {
    const rawPath = (completion.result as any)?.artifact?.path as string | undefined
    checks.push({
      name: 'result.artifact.path present',
      pass: Boolean(rawPath),
    })

    if (rawPath) {
      const resolvedPath = isAbsolute(rawPath) ? rawPath : join(input.workspaceDir, rawPath)
      const planText = await readFile(resolvedPath, 'utf8')
      const plan = JSON.parse(planText)
      for (const check of input.checks ?? []) {
        const pass = check.verify(plan)
        checks.push({ name: check.name, pass, detail: check.detail?.(plan) })
      }

      if (input.publish) {
        const publication = await publishActionArtifact({
          completion,
          adapter: createLearningPlanArtifactAdapter(input.workspaceDir),
          workspaceDir: input.workspaceDir,
          sessionId: 'e2e-session',
          userId: 'e2e-user',
        })
        artifactStatus = publication?.status
        if (publication?.error) {
          console.log(`publish error:\n${publication.error}`)
        } else {
          console.log(`publish status: ${artifactStatus}`)
        }
        checks.push({ name: 'publish ready', pass: publication?.status === 'ready' })
      }
    }
  }

  results.push({
    id: input.id,
    expect: input.expect,
    outcome: completion.outcome,
    summary: completion.summary,
    artifactStatus,
    checks,
  })
  for (const check of checks) {
    console.log(`  ${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`)
  }
}

async function main(): Promise<void> {
  // Unlock config reads before any harness module touches getGlobalConfig().
  enableConfigs()
  // Prompt templates reference the MACRO global; bootstrap entries set it.
  ensureBootstrapMacro()
  // Skill discovery is rooted at the repo root (skills/ lives there), which is
  // three levels above this script.
  setProjectRoot(resolve(import.meta.dir, '../../..'))
  // Register the app-owned global skills (baseline-assessment, competency
  // model, learning-plan) into the command system, as startup does.
  registerCareerAgentSkills()
  // Resolve the command before chdir: skill discovery is rooted at the repo.
  const command = await getSkillActionCommand('learning-plan')

  const workspaceDir = await setupWorkspace()
  // The harness's Write/Read tools resolve against its own cwd state, not
  // process.cwd(), so point the harness at the temp workspace for the run.
  const previousCwd = process.cwd()
  setCwdState(workspaceDir)

  try {
    const modelPath = join(workspaceDir, 'action_artifacts', 'career-competency-model-e2e.json')
    const baselinePath = join(workspaceDir, 'action_artifacts', 'baseline-assessment-e2e.json')
    await writeFile(modelPath, JSON.stringify(competencyModelFixture('LLM Agent 工程师', '2026-08-15'), null, 2))
    await writeFile(baselinePath, JSON.stringify(baselineFixture('LLM Agent 工程师', '2026-08-15T09:00:00.000Z'), null, 2))

    // Case 1: happy path with explicit refs + user constraints
    await runCase({
      id: 'happy-path-refs',
      command,
      workspaceDir,
      actionInput: {
        model_ref: modelPath,
        baseline_ref: baselinePath,
        constraints: { available_time_per_week: '10 小时', deadline: '2027-02-15' },
      },
      contextMessages: [
        createUserMessage({ content: '请基于上面的能力模型和基线评估为我制定学习计划,我每周可以投入 10 小时,希望在 2027 年 2 月中旬前达到目标。' }),
      ],
      expect: 'success',
      publish: true,
      checks: [
        { name: 'plan has prioritized_gaps', verify: p => Array.isArray(p.prioritized_gaps) && p.prioritized_gaps.length > 0 },
        { name: 'plan has stages', verify: p => Array.isArray(p.stages) && p.stages.length > 0 },
        { name: 'lineage validation recorded', verify: p => typeof p.lineage?.validation?.target_correspondence === 'string' },
        { name: 'goal_level is market-aligned null', verify: p => p.goal_level === null },
        {
          name: 'every gap carries expected_depth, delta, and valid gap category',
          verify: p => p.prioritized_gaps.every((g: any) => typeof g.expected_depth === 'string' && typeof g.delta === 'number' && ['missing', 'shallow'].includes(g.gap)),
        },
        { name: 'duration basis from user constraints', verify: p => p.stages.some((s: any) => s.estimated_duration?.basis === 'from_user_constraints') },
      ],
    })

    // Case 2: goal_level lowered to working, no deadline. Use a baseline where
    // Workflow 编排 is only foundational so the market anchor stays visible.
    const foundationalBaselinePath = join(workspaceDir, 'action_artifacts', 'baseline-assessment-foundational.json')
    await writeFile(foundationalBaselinePath, JSON.stringify(baselineFixture('LLM Agent 工程师', '2026-08-15T09:00:00.000Z', 'foundational'), null, 2))
    await runCase({
      id: 'goal-working-no-deadline',
      command,
      workspaceDir,
      actionInput: {
        model_ref: modelPath,
        baseline_ref: foundationalBaselinePath,
        goal_level: 'working',
        constraints: { available_time_per_week: '6 小时', deadline: null },
      },
      contextMessages: [
        createUserMessage({ content: '我的目标只是先达到能入门的水平,每周大概 6 小时,没有期限。请按这个目标制定学习计划。' }),
      ],
      expect: 'success',
      checks: [
        { name: 'goal_level working', verify: p => p.goal_level === 'working' },
        { name: 'target_depth capped at working', verify: p => p.prioritized_gaps.every((g: any) => g.target_depth === 'working') },
        { name: 'expected_depth anchor preserved', verify: p => p.prioritized_gaps.some((g: any) => g.expected_depth === 'independent') },
      ],
    })

    // Case 3: no refs — resolved from context tool results
    await runCase({
      id: 'context-discovery-no-refs',
      command,
      workspaceDir,
      actionInput: {
        constraints: { available_time_per_week: '12 小时', deadline: '2027-01-01' },
      },
      contextMessages: [
        createUserMessage({
          content: [
            '请基于本会话中已经产出的能力模型与基线评估制定学习计划,我每周 12 小时,期限 2027 年 1 月初。',
            '此前工具结果:',
            JSON.stringify({
              skill_name: 'career-competency-model',
              outcome: 'success',
              artifact: { artifact_type: 'career-competency-model', status: 'ready', canonical_path: modelPath },
            }),
            JSON.stringify({
              skill_name: 'baseline-assessment',
              outcome: 'success',
              artifact: { artifact_type: 'baseline-assessment', status: 'ready', canonical_path: baselinePath },
            }),
          ].join('\n'),
        }),
      ],
      expect: 'success',
      checks: [
        {
          name: 'plan has gaps and stages',
          verify: p => Array.isArray(p.prioritized_gaps) && p.prioritized_gaps.length > 0 && Array.isArray(p.stages) && p.stages.length > 0,
        },
      ],
    })

    // Case 4: mismatched targets → insufficient_input
    const mismatchedBaselinePath = join(workspaceDir, 'action_artifacts', 'baseline-assessment-mismatched.json')
    await writeFile(mismatchedBaselinePath, JSON.stringify(baselineFixture('数据分析师', '2026-08-15T09:00:00.000Z'), null, 2))
    await runCase({
      id: 'mismatched-targets',
      command,
      workspaceDir,
      actionInput: {
        model_ref: modelPath,
        baseline_ref: mismatchedBaselinePath,
        constraints: { available_time_per_week: '10 小时', deadline: '2027-02-15' },
      },
      contextMessages: [createUserMessage({ content: '请基于这两个产物制定学习计划。' })],
      expect: 'insufficient_input',
    })

    // Case 5: unusably stale model → insufficient_input
    const staleModelPath = join(workspaceDir, 'action_artifacts', 'career-competency-model-stale.json')
    await writeFile(staleModelPath, JSON.stringify(competencyModelFixture('LLM Agent 工程师', '2023-06-01'), null, 2))
    await runCase({
      id: 'stale-model',
      command,
      workspaceDir,
      actionInput: {
        model_ref: staleModelPath,
        baseline_ref: baselinePath,
        constraints: { available_time_per_week: '10 小时', deadline: '2027-02-15' },
      },
      contextMessages: [
        createUserMessage({
          content: '请基于这两个产物制定学习计划。补充背景:我这两年换过两次工作,目前的目标行业也变了,之前的信息可能过时了。',
        }),
      ],
      expect: 'insufficient_input',
    })

    // -------------------------------------------------------------------------
    console.log('\n\n================ E2E SUMMARY ================')
    let failed = 0
    for (const result of results) {
      const caseFailed =
        result.outcome !== result.expect || result.checks.some(check => !check.pass)
      if (caseFailed) failed += 1
      console.log(
        `${caseFailed ? '✗' : '✓'} ${result.id} — ${result.outcome}${result.artifactStatus ? ` (publish: ${result.artifactStatus})` : ''}`,
      )
      for (const check of result.checks.filter(c => !c.pass)) {
        console.log(`    FAIL ${check.name}${check.detail ? ` — ${check.detail}` : ''}`)
      }
    }
    console.log(`${results.length - failed}/${results.length} cases passed`)
    process.exitCode = failed > 0 ? 1 : 0
  } finally {
    setCwdState(previousCwd)
    await rm(workspaceDir, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
