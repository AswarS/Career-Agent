/**
 * debug-thinking-stream.test.ts
 *
 * Diagnoses "Content block is not a thinking block".
 *
 * Layer 1 — unit (no API key):
 *   Verifies modelSupportsISP identifies claude-sonnet-4.x correctly.
 *
 * Layer 2 — live (needs ANTHROPIC_API_KEY):
 *   Makes two raw fetch calls to api.anthropic.com:
 *   (A) WITHOUT ISP beta — what the server sends after DISABLE_INTERLEAVED_THINKING=1
 *   (B) WITH    ISP beta — what the server sent before the fix
 *   Logs every content_block_start.type and every delta.type so we can see
 *   exactly what arrives and whether thinking blocks appear.
 *
 * Run (Layer 1 only):
 *   cd backend && bun test tests/debug-thinking-stream.test.ts
 *
 * Run (Layer 1 + 2):
 *   cd backend && ANTHROPIC_API_KEY=sk-ant-... bun test tests/debug-thinking-stream.test.ts
 */

import { describe, test, expect } from 'bun:test'
import { modelSupportsISP } from '../src/utils/betas.js'
import { INTERLEAVED_THINKING_BETA_HEADER } from '../src/constants/betas.js'

const TEST_MODEL = process.env.MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5'
const API_KEY = process.env.ANTHROPIC_API_KEY
const BASE_URL = (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/+$/, '')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StreamEvent = {
  type: string
  index?: number
  content_block?: { type: string }
  delta?: { type: string; thinking?: string; signature?: string; text?: string }
}

async function fetchStreamEvents(
  apiKey: string,
  extraBetas: string[],
  withThinkingParam: boolean,
): Promise<StreamEvent[]> {
  const betas = [...extraBetas]
  const body: Record<string, unknown> = {
    model: TEST_MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
    stream: true,
  }
  if (withThinkingParam) {
    body.thinking = { type: 'enabled', budget_tokens: 1024 }
  }

  const resp = await fetch(`${BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      ...(betas.length > 0 ? { 'anthropic-beta': betas.join(',') } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '')
    throw new Error(`API ${resp.status}: ${errBody}`)
  }

  const events: StreamEvent[] = []
  const text = await resp.text()
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const data = line.slice(6).trim()
    if (!data || data === '[DONE]') continue
    try { events.push(JSON.parse(data)) } catch { /* skip */ }
  }
  return events
}

function analyzeEvents(label: string, events: StreamEvent[]) {
  const contentBlocks: Record<number, string> = {}
  const mismatches: string[] = []

  const textAccum: Record<number, string> = {}
  let thinkingDeltaCount = 0
  let textDeltaCount = 0

  for (const e of events) {
    if (e.type === 'content_block_start') {
      const t = e.content_block?.type ?? 'unknown'
      contentBlocks[e.index!] = t
      textAccum[e.index!] = ''
      console.log(`  [${label}] content_block_start  index=${e.index}  type=${t}`)
    }
    if (e.type === 'content_block_delta') {
      const dt = e.delta?.type ?? 'unknown'
      const bt = contentBlocks[e.index!]
      if (dt === 'thinking_delta' || dt === 'signature_delta') {
        thinkingDeltaCount++
        if (bt !== 'thinking') mismatches.push(`${dt} at index=${e.index} on blockType=${bt}`)
      } else if (dt === 'text_delta') {
        textDeltaCount++
        textAccum[e.index!] = (textAccum[e.index!] ?? '') + (e.delta?.text ?? '')
      }
    }
  }

  const blockTypes = Object.values(contentBlocks)
  const textOutputs = Object.entries(textAccum)
    .filter(([, v]) => v.length > 0)
    .map(([k, v]) => `[${k}]: "${v.slice(0, 80)}${v.length > 80 ? '…' : ''}"`)

  console.log(`  [${label}] blocks: ${JSON.stringify(contentBlocks)}`)
  console.log(`  [${label}] thinking_delta count: ${thinkingDeltaCount}  text_delta count: ${textDeltaCount}`)
  console.log(`  [${label}] text output: ${textOutputs.length ? textOutputs.join(' | ') : '(empty)'}`)
  console.log(`  [${label}] mismatches: ${mismatches.length ? `${mismatches.length} (first: ${mismatches[0]})` : 'none'}`)
  return { blockTypes, mismatches }
}

// ---------------------------------------------------------------------------
// Layer 1: unit — no API key needed
// ---------------------------------------------------------------------------

describe('modelSupportsISP', () => {
  test('claude-sonnet-4-5 is ISP-capable', () => {
    expect(modelSupportsISP(TEST_MODEL)).toBe(true)
  })

  test('claude-3-5-sonnet is NOT ISP-capable', () => {
    expect(modelSupportsISP('claude-3-5-sonnet-20241022')).toBe(false)
  })

  test('INTERLEAVED_THINKING_BETA_HEADER constant is set', () => {
    expect(INTERLEAVED_THINKING_BETA_HEADER).toBe('interleaved-thinking-2025-05-14')
  })
})

// ---------------------------------------------------------------------------
// Layer 2: live API calls — requires ANTHROPIC_API_KEY
// ---------------------------------------------------------------------------

describe('Live streaming — content block types', () => {

  // (A) No ISP beta, no thinking param — matches production after fix
  test.skipIf(!API_KEY)(
    '(A) No ISP beta, no thinking param → no thinking blocks expected',
    async () => {
      console.log('\n--- Test A: no ISP beta, no thinking param ---')
      const events = await fetchStreamEvents(API_KEY!, [], false)
      const { blockTypes, mismatches } = analyzeEvents('A', events)

      expect(mismatches).toHaveLength(0)
      // With thinking fully off, the response should contain only text blocks
      const hasThinking = blockTypes.includes('thinking') || blockTypes.includes('redacted_thinking')
      console.log(`  [A] has thinking blocks: ${hasThinking}`)
    },
  )

  // (B) ISP beta, no thinking param — matches production BEFORE fix
  test.skipIf(!API_KEY)(
    '(B) ISP beta, no thinking param → observe what the API actually sends',
    async () => {
      console.log('\n--- Test B: WITH ISP beta, no thinking param ---')
      const events = await fetchStreamEvents(API_KEY!, [INTERLEAVED_THINKING_BETA_HEADER], false)
      const { mismatches } = analyzeEvents('B', events)

      // We just observe — this test does NOT fail even if there are mismatches.
      // The goal is to see exactly what the API sends with ISP beta active.
      console.log(`  [B] mismatches found: ${mismatches.length}`)
      console.log('  (This test is intentionally non-failing — we are observing behavior)')
    },
  )

  // (C) ISP beta + explicit thinking param — the "fully enabled thinking" case
  test.skipIf(!API_KEY)(
    '(C) ISP beta + thinking param → thinking blocks expected and should be correct',
    async () => {
      console.log('\n--- Test C: ISP beta + explicit thinking param ---')
      const events = await fetchStreamEvents(API_KEY!, [INTERLEAVED_THINKING_BETA_HEADER], true)
      const { mismatches } = analyzeEvents('C', events)

      // When thinking is properly enabled, there should be no mismatches
      expect(mismatches).toHaveLength(0)
    },
  )
})
