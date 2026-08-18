/**
 * GitHub MCP trajectory probe: drives one fresh conversation and reports the
 * exact tool-call sequence, so ToolSearch loops vs. real mcp__github__* calls
 * are visible without digging through the transcript.
 *
 * Requires the Network server to be running.
 * Run: bun run ./scripts/probe-github-mcp.ts
 */
import { writeFile } from 'node:fs/promises'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4000'
const API = `${BASE_URL}/api/career-agent`
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 20 * 60_000)

type ToolCall = { name: string; input?: unknown; resultText?: string }

const toolCalls: ToolCall[] = []

async function api(path: string, options: { method?: string; body?: unknown } = {}): Promise<any> {
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

function buildAnswer(question: string, options: Array<{ label: string; description?: string }> | undefined): string {
  const q = question.toLowerCase()
  if (/每周|weekly|per week/.test(q)) return '每周 10 小时'
  if (/期限|多久|什么时间前|deadline|月内|何时/.test(q)) return '6 个月'
  if (/水平|目标|程度|level|goal/.test(q)) {
    const market = (options ?? []).find(o => /市场|对齐|job.?ready|market/.test(`${o.label} ${o.description ?? ''}`))
    return market?.label ?? (options?.[0]?.label ?? '对齐市场预期')
  }
  return options?.[0]?.label ?? '按推荐选项'
}

async function main(): Promise<void> {
  const thread = await api('/threads', { method: 'POST', body: { title: 'GitHub MCP 验证' } })
  const threadId = String(thread.id ?? thread.uuid)
  console.log(`thread: ${threadId}`)

  const response = await fetch(`${API}/threads/${threadId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content:
        process.env.E2E_MESSAGE
        ?? '你能读到我 GitHub 上的 AAAI2027 仓库吗?先看一下这个仓库的 README 文件内容。',
    }),
  })
  if (!response.ok || !response.body) {
    throw new Error(`stream failed: ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentToolCall: ToolCall | undefined
  const answered = new Set<string>()
  const deadline = Date.now() + TIMEOUT_MS

  while (true) {
    if (Date.now() > deadline) {
      console.log('!! TIMEOUT — trajectory so far:')
      break
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
      let event: any
      try { event = JSON.parse(data) } catch { continue }

      const blocks: any[] = []
      if (event.block) blocks.push(event.block)
      if (Array.isArray(event.blocks)) blocks.push(...event.blocks)

      for (const block of blocks) {
        if (block?.type === 'tool_call' && typeof block.name === 'string') {
          currentToolCall = { name: block.name }
          toolCalls.push(currentToolCall)
          console.log(`[tool_call] ${block.name}`)
        } else if (block?.type === 'tool_result') {
          if (currentToolCall && currentToolCall.name === block.name) {
            currentToolCall.resultText = String(block.text ?? '').slice(0, 200)
          }
          if (block.text) {
            const t = String(block.text)
            if (t.includes('tool_reference')) {
              const names = [...t.matchAll(/"tool_name":\s*"([^"]+)"/g)].map(m => m[1])
              console.log(`  → tool_reference: ${names.join(', ')}`)
            } else {
              console.log(`  → result: ${t.slice(0, 150).replace(/\n/g, ' ')}`)
            }
          }
          if (block.isError) console.log('  → (ERROR)')
        } else if (block?.type === 'ask_question') {
          const toolUseId = block.toolUseId
          const questions = block.questions ?? []
          if (!toolUseId || answered.has(toolUseId) || !questions.length) continue
          const answers: Record<string, string> = {}
          for (const q of questions) {
            const answer = buildAnswer(q.question, q.options)
            answers[q.question] = answer
            console.log(`[ask] ${q.question} → ${answer}`)
          }
          await api(`/threads/${threadId}/tool-responses/${toolUseId}`, {
            method: 'POST', body: { approved: true, answers },
          })
          answered.add(toolUseId)
        }
      }

      if (event.type === 'message.completed') {
        console.log(`[message.completed] reply: ${String(event.reply ?? '').slice(0, 300).replace(/\n/g, ' ')}`)
      }
    }
  }

  const byName = new Map<string, number>()
  for (const call of toolCalls) byName.set(call.name, (byName.get(call.name) ?? 0) + 1)
  const trajectory = [...byName.entries()].map(([name, count]) => `${name} x${count}`).join(' → ')
  console.log('\n=== TRAJECTORY ===')
  console.log(trajectory)
  const realMcpCalls = toolCalls.filter(c => c.name.startsWith('mcp__github__')).length
  const toolSearchCalls = byName.get('ToolSearch') ?? 0
  console.log(`mcp__github__* calls: ${realMcpCalls} | ToolSearch calls: ${toolSearchCalls}`)
  const verdict = realMcpCalls > 0 ? 'PASS: real MCP calls happened' : 'FAIL: no real MCP call'
  console.log(verdict)
  await writeFile('/tmp/github-mcp-probe.txt', `${trajectory}\n${verdict}\n`, 'utf8')
  process.exitCode = realMcpCalls > 0 ? 0 : 1
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
