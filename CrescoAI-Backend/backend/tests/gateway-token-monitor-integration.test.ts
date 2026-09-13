import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createOpenAICompatibilityFetch } from '../src/services/api/openAICompatibility.js'

let monitorDir = ''
const previousEnabled = process.env.CAREER_AGENT_GATEWAY_MONITOR_ENABLED
const previousDir = process.env.CAREER_AGENT_GATEWAY_MONITOR_DIR

beforeAll(async () => {
  monitorDir = await mkdtemp(join(tmpdir(), 'career-agent-gateway-monitor-'))
  process.env.CAREER_AGENT_GATEWAY_MONITOR_ENABLED = 'true'
  process.env.CAREER_AGENT_GATEWAY_MONITOR_DIR = monitorDir
})

afterAll(async () => {
  if (previousEnabled === undefined) {
    delete process.env.CAREER_AGENT_GATEWAY_MONITOR_ENABLED
  } else {
    process.env.CAREER_AGENT_GATEWAY_MONITOR_ENABLED = previousEnabled
  }
  if (previousDir === undefined) {
    delete process.env.CAREER_AGENT_GATEWAY_MONITOR_DIR
  } else {
    process.env.CAREER_AGENT_GATEWAY_MONITOR_DIR = previousDir
  }
  await rm(monitorDir, { recursive: true, force: true })
})

describe('gateway monitor boundary integration', () => {
  test('pairs request attribution with streamed provider usage', async () => {
    const upstreamBody = [
      'data: {"id":"reply-1","model":"test","choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}',
      '',
      'data: {"choices":[],"usage":{"prompt_tokens":120,"completion_tokens":5,"total_tokens":125}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')
    const adapter = createOpenAICompatibilityFetch({
      baseUrl: 'https://gateway.test/v1',
      sessionId: 'verification-session',
      userId: '1',
      fetchImpl: async () => new Response(upstreamBody, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    })

    const response = await adapter('https://gateway.test/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'test',
        stream: true,
        system: 'system prompt',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [{
          name: 'Read',
          description: 'read file',
          input_schema: { type: 'object' },
        }],
      }),
    })
    await response.text()

    const files = await readdir(monitorDir)
    expect(files).toHaveLength(1)
    const events = (await readFile(join(monitorDir, files[0]!), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(events).toHaveLength(2)
    expect(events[0].event).toBe('gateway.request')
    expect(events[0].breakdown.systemTokens).toBeGreaterThan(0)
    expect(events[0].breakdown.toolDefinitionTokens).toBeGreaterThan(0)
    expect(events[1]).toMatchObject({
      event: 'gateway.response',
      outcome: 'completed',
      usage: {
        prompt_tokens: 120,
        completion_tokens: 5,
        total_tokens: 125,
      },
    })
    expect(events[1].request_id).toBe(events[0].request_id)
  })
})
