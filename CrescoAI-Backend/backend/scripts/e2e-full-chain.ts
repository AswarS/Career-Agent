/**
 * Full-chain E2E over the real Network server: creates a conversation visible
 * in the frontend, drives the complete three-skill chain
 * (CareerCompetencyModel → BaselineAssessment → LearningPlan) through the real
 * agent, answers AskUserQuestion prompts on the user's behalf (grounded in the
 * user's Profile), and verifies the resulting artifacts through the public API.
 *
 * Requires the Network server to be running (bun run ./src/Network/main.ts).
 *
 * Run: bun run ./scripts/e2e-full-chain.ts
 */
import { writeFile } from 'node:fs/promises'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4000'
const API = `${BASE_URL}/api/career-agent`
const OVERALL_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 60 * 60_000)

type StreamEvent = {
  type: string
  sequence?: number
  messageId?: string
  assistantMessageId?: string
  block?: Record<string, unknown>
  blocks?: unknown[]
  reply?: string
  actions?: unknown[]
  media?: unknown[]
  [key: string]: unknown
}

type AskBlock = {
  type: 'ask_question'
  toolUseId?: string | null
  name?: string | null
  questions?: Array<{
    question: string
    header?: string
    options?: Array<{ label: string; description?: string }>
    multiSelect?: boolean
  }>
  status?: string
}

const log = console.log

async function api(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<any> {
  const response = await fetch(`${API}${path}`, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  })
  if (!response.ok) {
    throw new Error(`API ${options.method ?? 'GET'} ${path} → ${response.status}: ${await response.text()}`)
  }
  return response.json()
}

// ---------------------------------------------------------------------------
// AskUser answering policy: answer on the user's behalf, grounded in the
// user's Profile (per the E2E convention). Never block the chain.
// ---------------------------------------------------------------------------

function buildAnswer(question: string, options: Array<{ label: string; description?: string }> | undefined, profile: any): string {
  const questionText = question.toLowerCase()
  const availableTime = profile?.intentConstraints?.availableTime

  // Ordered checks: "每周" must win over the generic "时间" pattern so a
  // deadline question ("什么时间前完成") never gets a weekly-hours answer.
  if (/每周|weekly|per week/.test(questionText)) {
    return availableTime && availableTime.trim() ? availableTime.trim() : '每周 10 小时'
  }
  if (/期限|多久|什么时间前|deadline|月内|何时/.test(questionText)) {
    return '6 个月'
  }
  if (/水平|目标|程度|level|goal/.test(questionText)) {
    const marketOption = (options ?? []).find(option =>
      /市场|对齐|job.?ready|market/.test(`${option.label} ${option.description ?? ''}`),
    )
    return marketOption?.label ?? (options?.[0]?.label ?? '对齐市场预期')
  }
  if (/资源|方式|渠道/.test(questionText)) {
    return options?.[0]?.label ?? '自学为主'
  }
  return options?.[0]?.label ?? '按推荐选项'
}

function extractAskBlocks(event: StreamEvent): AskBlock[] {
  const candidates: unknown[] = []
  if (event.block) candidates.push(event.block)
  if (Array.isArray(event.blocks)) candidates.push(...event.blocks)
  const found: AskBlock[] = []
  for (const candidate of candidates) {
    if (
      candidate
      && typeof candidate === 'object'
      && (candidate as Record<string, unknown>).type === 'ask_question'
    ) {
      found.push(candidate as AskBlock)
    }
  }
  return found
}

// ---------------------------------------------------------------------------
// SSE stream driver
// ---------------------------------------------------------------------------

async function runConversation(threadId: string, content: string, profile: any): Promise<void> {
  log(`→ Sending message to thread ${threadId}`)
  const response = await fetch(`${API}/threads/${threadId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!response.ok || !response.body) {
    throw new Error(`stream request failed: ${response.status} ${await response.text()}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const answeredToolUseIds = new Set<string>()
  let finalReply = ''
  let sawCompleted = false

  const deadline = Date.now() + OVERALL_TIMEOUT_MS

  while (true) {
    if (Date.now() > deadline) {
      throw new Error('E2E timeout: conversation did not finish in time')
    }
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      let eventName = ''
      let data = ''
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) eventName = line.slice(7).trim()
        else if (line.startsWith('data: ')) data += line.slice(6)
      }
      if (!data.trim()) continue
      let event: StreamEvent
      try {
        event = JSON.parse(data)
      } catch {
        continue
      }

      if (event.type === 'reasoning.delta' || event.type === 'reply.delta') {
        // Streamed text — keep the log quiet but track completion.
      } else if (event.type === 'message.completed') {
        sawCompleted = true
        finalReply = typeof event.reply === 'string' ? event.reply : finalReply
        log(`✓ message.completed — reply length ${finalReply.length}`)
        for (const block of extractAskBlocks(event)) {
          log(`  ask_question after completion (toolUseId ${block.toolUseId}) — will not answer`)
        }
      } else if (event.type === 'skill.completed') {
        log(`  skill.completed: ${(event as any).skillName} → ${(event as any).outcome}`)
      } else if (event.type === 'artifact.created') {
        log('  artifact.created event received')
      } else if (event.type === 'error') {
        throw new Error(`stream error: ${JSON.stringify(event)}`)
      }

      for (const block of extractAskBlocks(event)) {
        const toolUseId = block.toolUseId
        if (!toolUseId || answeredToolUseIds.has(toolUseId)) continue
        const questions = block.questions ?? []
        if (!questions.length) continue

        log(`❓ AskUserQuestion (toolUseId ${toolUseId}):`)
        const answers: Record<string, string> = {}
        for (const q of questions) {
          const answer = buildAnswer(q.question, q.options, profile)
          answers[q.question] = answer
          log(`   Q: ${q.question}`)
          log(`   A: ${answer}`)
        }
        // The stream event can arrive before the server registers the pending
        // tool response, so retry briefly on the "no longer waiting" 404.
        let accepted = false
        for (let attempt = 0; attempt < 20 && !accepted; attempt += 1) {
          if (attempt > 0) await new Promise(resolveDelay => setTimeout(resolveDelay, 1_000))
          try {
            await api(`/threads/${threadId}/tool-responses/${toolUseId}`, {
              method: 'POST',
              body: { approved: true, answers },
            })
            accepted = true
          } catch (error) {
            if (attempt === 19) throw error
          }
        }
        answeredToolUseIds.add(toolUseId)
        log('   ✓ answered, conversation continues')
      }
    }
  }

  log(`\n=== Conversation finished (completed=${sawCompleted}) ===`)
  log(`Final reply preview: ${finalReply.slice(0, 500)}`)
}

// ---------------------------------------------------------------------------
// Verification through the public API (what the frontend consumes)
// ---------------------------------------------------------------------------

async function verify(threadId: string): Promise<boolean> {
  let failed = false
  const check = (name: string, pass: boolean, detail = '') => {
    log(`  ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
    if (!pass) failed = true
  }

  log('\n=== Verification (frontend-visible surface) ===')

  const threads = await api('/threads')
  const thread = Array.isArray(threads) ? threads.find((t: any) => String(t.id) === String(threadId)) : undefined
  check('thread visible in GET /threads', Boolean(thread), thread ? `title: ${thread.title}` : '')

  // Artifacts are per-user; the three artifacts produced by THIS run carry
  // the target role in their titles.
  const artifacts = await api('/artifacts')
  const artifactList = Array.isArray(artifacts) ? artifacts : (artifacts?.artifacts ?? [])
  const byRun = (type: string) => artifactList.find((a: any) =>
    a.type === type && typeof a.title === 'string' && a.title.includes('LLM Agent'),
  )
  check(
    'CareerCompetencyModel artifact listed',
    Boolean(byRun('career-competency-model')),
    byRun('career-competency-model')?.title ?? '',
  )
  check(
    'BaselineAssessment artifact listed',
    Boolean(byRun('baseline-assessment')),
    byRun('baseline-assessment')?.title ?? '',
  )
  const learningPlan = byRun('learning-plan')
  check(
    'LearningPlan artifact listed',
    Boolean(learningPlan),
    learningPlan?.title ?? '',
  )

  const messages = await api(`/threads/${threadId}/messages`)
  const assistantMessages = Array.isArray(messages)
    ? messages.filter((m: any) => m.role === 'assistant')
    : []
  check(
    'assistant messages present in thread',
    assistantMessages.length > 0,
    `${assistantMessages.length} message(s)`,
  )
  // Skill invocations are projected as tool_call blocks named after the
  // tools; there is no dedicated skill block type in the persisted transcript.
  const allBlocks = assistantMessages.flatMap((m: any) => m.blocks ?? [])
  const toolCallNames = new Set(
    allBlocks
      .filter((b: any) => b.type === 'tool_call' && typeof b.name === 'string')
      .map((b: any) => b.name),
  )
  check(
    'three skill tool calls recorded in transcript',
    ['CareerCompetencyModel', 'BaselineAssessment', 'LearningPlan'].every(name => toolCallNames.has(name)),
    [...toolCallNames].join(', '),
  )
  const askBlock = allBlocks.find((b: any) => b.type === 'ask_question')
  const answeredToolResult = allBlocks.find((b: any) =>
    b.type === 'tool_result' && Boolean(b.answers),
  )
  check(
    'AskUserQuestion asked and answered in transcript',
    Boolean(askBlock) && Boolean(answeredToolResult),
  )

  return !failed
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const REPORT_FILE = '/tmp/e2e-full-chain-report.md'

async function main(): Promise<void> {
  log(`Full-chain E2E against ${BASE_URL}`)

  // Verify-only mode: skip the (long) conversation and just verify a thread
  // that a previous run already produced.
  if (process.env.E2E_VERIFY_ONLY) {
    const pass = await verify(process.env.E2E_VERIFY_ONLY)
    log(pass ? 'FULL-CHAIN VERIFY PASSED' : 'FULL-CHAIN VERIFY FAILED')
    process.exitCode = pass ? 0 : 1
    return
  }

  // 1. Load the user's Profile — AskUser answers are grounded in it.
  const profile = await api('/profile')
  log(`✓ Profile loaded — careerGoal: ${profile?.intentConstraints?.careerGoal ?? '(none)'}`)

  // 2. Create the conversation.
  const thread = await api('/threads', {
    method: 'POST',
    body: { title: '全链路 E2E:LLM Agent 工程师' },
  })
  const threadId = String(thread.id ?? thread.uuid)
  log(`✓ Conversation created — id: ${threadId}`)

  // 3. Drive the full chain. Constraints are deliberately omitted so the
  //    agent must ask via AskUserQuestion before the learning plan.
  const content = [
    '请为我做一次完整的职业规划分析,严格按三步走:',
    '1. 用 CareerCompetencyModel 工具研究"LLM Agent 工程师"(中级、人工智能行业、中国)当前市场的能力模型;',
    '2. 基于我的 Profile 和本次会话中已有的证据,用 BaselineAssessment 工具评估我当前的基线;',
    '3. 最后用 LearningPlan 工具生成分阶段学习计划。',
    '注意:我还没有提供每周可投入时间和期望期限,请先用提问工具向我问清楚,再生成学习计划。',
  ].join('\n')

  await runConversation(threadId, content, profile)

  // 4. Verify the frontend-visible surface.
  const pass = await verify(threadId)

  const report = [
    `# 全链路 E2E 报告`,
    ``,
    `- 会话 ID: ${threadId}`,
    `- 后端: ${BASE_URL}(user 1)`,
    `- 结论: ${pass ? '全部通过' : '存在失败项'}`,
    `- 查看:前端工件中心 + 左侧会话列表("全链路 E2E:LLM Agent 工程师")`,
  ].join('\n')
  await writeFile(REPORT_FILE, report, 'utf8')
  log(`\nReport written to ${REPORT_FILE}`)
  log(pass ? 'FULL-CHAIN E2E PASSED' : 'FULL-CHAIN E2E FAILED')
  process.exitCode = pass ? 0 : 1
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
