import type { PermissionResult } from 'src/utils/permissions/PermissionResult.js'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { logError } from '../../utils/log.js'
import { jsonParse, jsonStringify } from '../../utils/slowOperations.js'
import { getWebSearchPrompt, WEB_SEARCH_TOOL_NAME } from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
} from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z.string().min(2).describe('The search query to use'),
    allowed_domains: z
      .array(z.string())
      .optional()
      .describe('Only include search results from these domains'),
    blocked_domains: z
      .array(z.string())
      .optional()
      .describe('Never include search results from these domains'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

type Input = z.infer<InputSchema>

const searchResultSchema = lazySchema(() => {
  const searchHitSchema = z.object({
    title: z.string().describe('The title of the search result'),
    url: z.string().describe('The URL of the search result'),
  })

  return z.object({
    tool_use_id: z.string().describe('ID of the tool use'),
    content: z.array(searchHitSchema).describe('Array of search hits'),
  })
})

export type SearchResult = z.infer<ReturnType<typeof searchResultSchema>>

const outputSchema = lazySchema(() =>
  z.object({
    query: z.string().describe('The search query that was executed'),
    results: z
      .array(z.union([searchResultSchema(), z.string()]))
      .describe('Search results and/or text commentary from the model'),
    durationSeconds: z
      .number()
      .describe('Time taken to complete the search operation'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

// Re-export WebSearchProgress from centralized types to break import cycles
export type { WebSearchProgress } from '../../types/tools.js'

import type { WebSearchProgress } from '../../types/tools.js'

const ANYSEARCH_ENDPOINT = 'https://api.anysearch.com/v1/search'
const DEFAULT_MAX_RESULTS = 10
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_CONTENT_MAX_CHARS = 4_000

const anySearchResponseSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  request_id: z.string().optional(),
  data: z.object({
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string().optional(),
        content: z.string().optional(),
      }),
    ),
    metadata: z
      .object({
        request_id: z.string().optional(),
        total_results: z.number().optional(),
        search_time_ms: z.number().optional(),
      })
      .optional(),
  }),
})

type AnySearchHit = z.infer<
  typeof anySearchResponseSchema
>['data']['results'][number]

// The previous implementation delegated search to Anthropic's model-bound
// web_search_20250305 server tool and parsed server_tool_use /
// web_search_tool_result streaming events. That path is intentionally disabled:
// WebSearch now calls AnySearch directly so it works with every model provider.

function readIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(maximum, Math.max(minimum, parsed))
}

function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) {
    return ''
  }

  try {
    const url = new URL(
      trimmed.includes('://') ? trimmed : `https://${trimmed}`,
    )
    return url.hostname.replace(/^www\./, '')
  } catch {
    return trimmed.replace(/^www\./, '').split('/')[0] ?? ''
  }
}

function isMatchingDomain(hostname: string, configuredDomain: string): boolean {
  return (
    hostname === configuredDomain || hostname.endsWith(`.${configuredDomain}`)
  )
}

function filterHitsByDomain(
  hits: AnySearchHit[],
  input: Input,
): AnySearchHit[] {
  const allowedDomains = (input.allowed_domains ?? [])
    .map(normalizeDomain)
    .filter(Boolean)
  const blockedDomains = (input.blocked_domains ?? [])
    .map(normalizeDomain)
    .filter(Boolean)

  return hits.filter((hit) => {
    let hostname: string
    try {
      hostname = new URL(hit.url).hostname.toLowerCase().replace(/^www\./, '')
    } catch {
      return false
    }

    if (blockedDomains.some((domain) => isMatchingDomain(hostname, domain))) {
      return false
    }

    return (
      allowedDomains.length === 0 ||
      allowedDomains.some((domain) => isMatchingDomain(hostname, domain))
    )
  })
}

function formatHitsForModel(hits: AnySearchHit[]): string {
  if (hits.length === 0) {
    return 'No search results matched the query and domain filters.'
  }

  const contentMaxChars = readIntegerEnv(
    'ANYSEARCH_CONTENT_MAX_CHARS',
    DEFAULT_CONTENT_MAX_CHARS,
    200,
    20_000,
  )

  return hits
    .map((hit, index) => {
      const snippet = hit.snippet?.trim()
      const content = hit.content?.trim()
      const usefulContent = content || snippet || 'No description provided.'
      const truncatedContent =
        usefulContent.length > contentMaxChars
          ? `${usefulContent.slice(0, contentMaxChars)}…`
          : usefulContent

      return [
        `[${index + 1}] ${hit.title}`,
        `URL: ${hit.url}`,
        snippet && content && snippet !== content
          ? `Summary: ${snippet}`
          : null,
        `Content: ${truncatedContent}`,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')
}

export const WebSearchTool = buildTool({
  name: WEB_SEARCH_TOOL_NAME,
  searchHint: 'search the web for current information',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  async description(input) {
    return `The assistant wants to search the web for: ${input.query}`
  },
  userFacingName() {
    return 'Web Search'
  },
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `Searching for ${summary}` : 'Searching the web'
  },
  isEnabled() {
    // AnySearch is model-provider independent and supports anonymous access.
    return true
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.query
  },
  async checkPermissions(_input): Promise<PermissionResult> {
    return {
      behavior: 'passthrough',
      message: 'WebSearchTool requires permission.',
      suggestions: [
        {
          type: 'addRules',
          rules: [{ toolName: WEB_SEARCH_TOOL_NAME }],
          behavior: 'allow',
          destination: 'localSettings',
        },
      ],
    }
  },
  async prompt() {
    return getWebSearchPrompt()
  },
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolResultMessage,
  extractSearchText() {
    // renderToolResultMessage shows only "Did N searches in Xs" chrome —
    // the results[] content never appears on screen. Heuristic would index
    // string entries in results[] (phantom match). Nothing to search.
    return ''
  },
  async validateInput(input) {
    const { query, allowed_domains, blocked_domains } = input
    if (!query.length) {
      return {
        result: false,
        message: 'Error: Missing query',
        errorCode: 1,
      }
    }
    if (allowed_domains?.length && blocked_domains?.length) {
      return {
        result: false,
        message:
          'Error: Cannot specify both allowed_domains and blocked_domains in the same request',
        errorCode: 2,
      }
    }
    return { result: true }
  },
  async call(input, context, _canUseTool, _parentMessage, onProgress) {
    const startTime = performance.now()
    const { query } = input

    onProgress?.({
      toolUseID: 'anysearch-query',
      data: { type: 'query_update', query },
    })

    const maxResults = readIntegerEnv(
      'ANYSEARCH_MAX_RESULTS',
      DEFAULT_MAX_RESULTS,
      1,
      100,
    )
    const timeoutMs = readIntegerEnv(
      'ANYSEARCH_TIMEOUT_MS',
      DEFAULT_TIMEOUT_MS,
      1_000,
      120_000,
    )
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    const apiKey = process.env.ANYSEARCH_API_KEY?.trim()
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const requestController = new AbortController()
    const sessionSignal = context.abortController.signal
    const abortFromSession = () => requestController.abort(sessionSignal.reason)
    if (sessionSignal.aborted) {
      abortFromSession()
    } else {
      sessionSignal.addEventListener('abort', abortFromSession, { once: true })
    }
    const timeout = setTimeout(
      () => requestController.abort(new Error('AnySearch request timed out')),
      timeoutMs,
    )

    try {
      const response = await fetch(ANYSEARCH_ENDPOINT, {
        method: 'POST',
        headers,
        body: jsonStringify({
          query,
          max_results: maxResults,
        }),
        signal: requestController.signal,
      })
      const responseText = await response.text()

      if (!response.ok) {
        throw new Error(
          `AnySearch request failed (${response.status} ${response.statusText}): ${responseText.slice(0, 1_000)}`,
        )
      }

      let responseJson: unknown
      try {
        responseJson = jsonParse(responseText)
      } catch (error) {
        throw new Error('AnySearch returned invalid JSON', { cause: error })
      }

      const parsed = anySearchResponseSchema.safeParse(responseJson)
      if (!parsed.success) {
        throw new Error(
          `AnySearch returned an unexpected response: ${parsed.error.message}`,
        )
      }
      if (parsed.data.code !== 0) {
        throw new Error(
          `AnySearch search failed (code ${parsed.data.code}): ${parsed.data.message ?? 'Unknown error'}`,
        )
      }

      const hits = filterHitsByDomain(parsed.data.data.results, input)
      const requestId =
        parsed.data.request_id ??
        parsed.data.data.metadata?.request_id ??
        `anysearch-${Date.now()}`
      const durationSeconds = (performance.now() - startTime) / 1000
      const results: (SearchResult | string)[] = [formatHitsForModel(hits)]

      if (hits.length > 0) {
        results.push({
          tool_use_id: requestId,
          content: hits.map((hit) => ({ title: hit.title, url: hit.url })),
        })
      }

      onProgress?.({
        toolUseID: requestId,
        data: {
          type: 'search_results_received',
          resultCount: hits.length,
          query,
        },
      })

      return {
        data: {
          query,
          results,
          durationSeconds,
        },
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)))
      throw error
    } finally {
      clearTimeout(timeout)
      sessionSignal.removeEventListener('abort', abortFromSession)
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const { query, results } = output

    let formattedOutput = `Web search results for query: "${query}"\n\n`

    // Process the results array - it can contain both string summaries and search result objects.
    // Guard against null/undefined entries that can appear after JSON round-tripping
    // (e.g., from compaction or transcript deserialization).
    ;(results ?? []).forEach((result) => {
      if (result == null) {
        return
      }
      if (typeof result === 'string') {
        // Text summary
        formattedOutput += result + '\n\n'
      } else {
        // Search result with links
        if (result.content?.length > 0) {
          formattedOutput += `Links: ${jsonStringify(result.content)}\n\n`
        } else {
          formattedOutput += 'No links found.\n\n'
        }
      }
    })

    formattedOutput +=
      '\nREMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.'

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: formattedOutput.trim(),
    }
  },
} satisfies ToolDef<InputSchema, Output, WebSearchProgress>)
