import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { getMultimodalConfig } from '../../utils/multimodalConfig.js'
import { getCwd } from '../../utils/cwd.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { DESCRIPTION, IMAGE_GENERATE_TOOL_NAME } from './prompt.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    prompt: z.string().describe('Text description of the image to generate'),
    model: z
      .string()
      .optional()
      .describe('Model name to use (e.g. dall-e-3, flux-pro)'),
    size: z
      .string()
      .optional()
      .describe('Image dimensions, e.g. "1024x1024" (default: 1024x1024)'),
    n: z
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe('Number of images to generate (default: 1)'),
    image_url: z
      .string()
      .optional()
      .describe(
        'Input image for image-to-image. Accepts a public URL (https://...) or a local file path. When provided, the tool switches to img2img mode.',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    filePaths: z.array(z.string()),
    model: z.string().optional(),
    error: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const ImageGenerateTool = buildTool({
  name: IMAGE_GENERATE_TOOL_NAME,
  searchHint: 'generate images from text prompts using AI',
  maxResultSizeChars: 10_000,

  async description(input) {
    const { prompt } = input as { prompt?: string }
    return prompt ? `Generate image: "${prompt}"` : 'Generate an image'
  },

  userFacingName() {
    return 'ImageGenerate'
  },

  getActivityDescription(input) {
    const { prompt } = (input ?? {}) as { prompt?: string }
    return prompt ? `Generating image: ${prompt.slice(0, 60)}` : 'Generating image'
  },

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  get outputSchema(): OutputSchema {
    return outputSchema()
  },

  isEnabled() {
    const cfg = getMultimodalConfig()
    return !!(cfg.image_url && cfg.image_key)
  },

  isConcurrencySafe() {
    return true
  },

  isReadOnly() {
    return false
  },

  toAutoClassifierInput(input) {
    return `image: ${input.prompt}`
  },

  async prompt() {
    return DESCRIPTION
  },

  renderToolUseMessage,
  renderToolResultMessage,

  async call({ prompt, model, size, n = 1, image_url }, { abortController }) {
    const config = getMultimodalConfig()
    const baseUrl = config.image_url
    const apiKey = config.image_key
    const defaultModel = config.image_default_model
    const allowedModels = config.image_models ?? []

    // ── Logging setup ──
    const outDir = join(getCwd(), 'image_generated')
    mkdirSync(outDir, { recursive: true })
    const logFile = join(outDir, 'image-generate.log')
    function log(msg: string) {
      const line = `[${new Date().toISOString()}] ${msg}\n`
      appendFileSync(logFile, line)
    }

    log(`--- ImageGenerate called ---`)
    log(`prompt: ${prompt}`)

    if (!baseUrl) {
      const err = 'image_url is not configured. Add "image_url" to $CLAUDE_CONFIG_DIR/multimodal_config.json.'
      log(`ERROR: ${err}`)
      return { data: { filePaths: [], error: err } }
    }
    if (!apiKey) {
      const err = 'image_key is not configured. Add "image_key" to $CLAUDE_CONFIG_DIR/multimodal_config.json.'
      log(`ERROR: ${err}`)
      return { data: { filePaths: [], error: err } }
    }

    // Model resolution:
    // - No model specified → use default
    // - Model specified + allowlist non-empty + not in list → fall back to default
    // - Model specified + (allowlist empty or in list) → use as-is
    let resolvedModel: string | undefined
    if (!model) {
      resolvedModel = defaultModel
      log(`model: not specified → using default "${resolvedModel ?? '(none)'}"`)
    } else if (allowedModels.length > 0) {
      // Fuzzy match: exact → suffix-after-slash → substring
      const exact = allowedModels.find(m => m === model)
      const suffix = allowedModels.find(m => m.endsWith(`/${model}`) || m.endsWith(model))
      const partial = allowedModels.find(m => m.includes(model))
      const matched = exact ?? suffix ?? partial
      if (matched) {
        resolvedModel = matched
        log(`model: "${model}" fuzzy-matched to "${matched}"${matched !== model ? ` (expanded)` : ''}`)
      } else {
        resolvedModel = defaultModel
        log(`model: "${model}" not in image_models [${allowedModels.join(', ')}] → falling back to default "${resolvedModel ?? '(none)'}"`)
      }
    } else {
      resolvedModel = model
      log(`model: using "${resolvedModel}" (no allowlist)`)
    }

    if (!resolvedModel) {
      const err = 'No model resolved. Set "image_default_model" in $CLAUDE_CONFIG_DIR/multimodal_config.json or specify a model.'
      log(`ERROR: ${err}`)
      return { data: { filePaths: [], error: err } }
    }

    const base = baseUrl.replace(/\/$/, '')

    // OpenRouter / chat-modality format: POST /v1/chat/completions with modalities:['image']
    // OpenAI images format:              POST /v1/images/generations
    // We try chat completions first (OpenRouter style), fall back to images API.
    type ChatResp = {
      choices?: Array<{
        message?: {
          images?: Array<{ image_url?: { url?: string } }>
        }
      }>
      model?: string
      error?: { message?: string }
    }
    type ImagesResp = {
      data?: Array<{ b64_json?: string; url?: string }>
      model?: string
      error?: { message?: string }
    }

    async function postJSON(
      endpoint: string,
      body: Record<string, unknown>,
    ): Promise<{ ok: boolean; status: number; statusText: string; json: unknown }> {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      })
      return { ok: resp.ok, status: resp.status, statusText: resp.statusText, json: await resp.json() }
    }

    // Extract error message from a response body (best-effort)
    function extractErrorMsg(json: unknown): string | undefined {
      if (typeof json !== 'object' || json === null) return undefined
      const j = json as Record<string, unknown>
      const err = j['error']
      if (typeof err === 'string') return err
      if (typeof err === 'object' && err !== null) {
        const msg = (err as Record<string, unknown>)['message']
        if (typeof msg === 'string') return msg
      }
      return undefined
    }

    // A 404 from OpenRouter with "No endpoints found" means the model doesn't
    // support the requested modalities — retrying will never help.
    function isPermanentFailure(status: number, json: unknown): boolean {
      if (status === 400 || status === 401 || status === 403) return true
      if (status === 404) {
        const msg = extractErrorMsg(json) ?? ''
        return msg.toLowerCase().includes('no endpoints found')
      }
      return false
    }

    async function postWithRetry(
      endpoint: string,
      body: Record<string, unknown>,
      maxRetries = 5,
    ): Promise<{ ok: boolean; status: number; statusText: string; json: unknown }> {
      let lastResult: { ok: boolean; status: number; statusText: string; json: unknown } | undefined
      let lastErr: unknown

      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
          const result = await postJSON(endpoint, body)
          if (result.ok || isPermanentFailure(result.status, result.json)) {
            return result  // success or permanent error — stop immediately
          }
          lastResult = result
          if (attempt <= maxRetries) {
            const delayMs = Math.min(1000 * 2 ** (attempt - 1), 16_000) // 1s, 2s, 4s, 8s, 16s
            log(`retry ${attempt}/${maxRetries}: HTTP ${result.status} from ${endpoint}, waiting ${delayMs}ms`)
            await new Promise(r => setTimeout(r, delayMs))
          }
        } catch (err) {
          lastErr = err
          if (attempt <= maxRetries) {
            const delayMs = Math.min(1000 * 2 ** (attempt - 1), 16_000)
            log(`retry ${attempt}/${maxRetries}: network error (${err instanceof Error ? err.message : String(err)}), waiting ${delayMs}ms`)
            await new Promise(r => setTimeout(r, delayMs))
          }
        }
      }

      if (lastErr) throw lastErr
      return lastResult!
    }

    // Collect raw image entries: { dataUrl?, remoteUrl? }
    type ImageEntry = { dataUrl?: string; remoteUrl?: string }
    let imageEntries: ImageEntry[] = []
    let responseModel: string | undefined

    // ── Resolve input image (img2img) ──
    let inputImageDataUrl: string | undefined
    if (image_url) {
      if (image_url.startsWith('http://') || image_url.startsWith('https://')) {
        inputImageDataUrl = image_url
        log(`img2img: using remote URL ${image_url.slice(0, 80)}`)
      } else {
        // Local file path → base64 data URL
        const buf = readFileSync(image_url)
        const ext = image_url.split('.').pop()?.toLowerCase() ?? 'png'
        const mime =
          ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
          : ext === 'webp' ? 'image/webp'
          : ext === 'gif' ? 'image/gif'
          : 'image/png'
        inputImageDataUrl = `data:${mime};base64,${buf.toString('base64')}`
        log(`img2img: loaded local file ${image_url} (${buf.length} bytes, ${mime})`)
      }
    }

    // ── Try OpenRouter chat-modality path ──
    const chatEndpoint = `${base}/v1/chat/completions`

    // img2img: multimodal content array; text-to-image: plain string
    const userContent = inputImageDataUrl
      ? [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: inputImageDataUrl } },
        ]
      : prompt

    const chatBody: Record<string, unknown> = {
      model: resolvedModel,
      messages: [{ role: 'user', content: userContent }],
      modalities: ['image'],
    }

    log(`trying chat-modality: POST ${chatEndpoint} model=${resolvedModel} mode=${inputImageDataUrl ? 'img2img' : 'text2img'}`)

    let chatResp: ChatResp
    try {
      const r = await postWithRetry(chatEndpoint, chatBody)
      chatResp = r.json as ChatResp
      log(`chat-modality response: HTTP ${r.status} ${r.statusText}`)

      if (!r.ok) {
        const chatErrMsg = chatResp?.error?.message ?? r.statusText
        // "No endpoints found" = model doesn't support these modalities — don't fall through to images API
        if (chatErrMsg.toLowerCase().includes('no endpoints found')) {
          const hint = inputImageDataUrl
            ? `Model "${resolvedModel}" does not support img2img (modalities: image+text). Use a model that supports image input, e.g. google/gemini-2.5-flash-image-preview or sourceful/riverflow-v2-pro.`
            : `Model "${resolvedModel}" does not support image generation via chat-modality.`
          log(`ERROR: permanent failure — ${hint}`)
          return { data: { filePaths: [], error: hint } }
        }
        log(`chat-modality failed (${chatErrMsg}), trying images API`)

        const imagesEndpoint = `${base}/v1/images/generations`
        const imagesBody: Record<string, unknown> = { prompt, n }
        if (resolvedModel) imagesBody.model = resolvedModel
        if (size) imagesBody.size = size

        log(`trying images API: POST ${imagesEndpoint}`)
        const ir = await postWithRetry(imagesEndpoint, imagesBody)
        const imagesResp = ir.json as ImagesResp
        log(`images API response: HTTP ${ir.status} ${ir.statusText}`)

        if (!ir.ok) {
          const msg =
            imagesResp?.error?.message ??
            chatResp?.error?.message ??
            `HTTP ${ir.status} ${ir.statusText}`
          log(`ERROR: both paths failed — ${msg}`)
          return { data: { filePaths: [], error: msg } }
        }

        responseModel = imagesResp.model ?? resolvedModel
        imageEntries = (imagesResp.data ?? []).map(item => ({
          dataUrl: item.b64_json ? `data:image/png;base64,${item.b64_json}` : undefined,
          remoteUrl: item.url,
        }))
        log(`images API: got ${imageEntries.length} image(s)`)
      } else {
        responseModel = chatResp.model ?? resolvedModel
        const images = chatResp.choices?.[0]?.message?.images ?? []
        imageEntries = images.map(img => ({ dataUrl: img.image_url?.url }))
        log(`chat-modality: got ${imageEntries.length} image(s)`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`ERROR: fetch threw — ${msg}`)
      return { data: { filePaths: [], error: msg } }
    }

    if (imageEntries.length === 0) {
      log(`ERROR: API returned no images`)
      return { data: { filePaths: [], error: 'API returned no images' } }
    }

    const timestamp = Date.now()
    const filePaths: string[] = []

    for (let i = 0; i < imageEntries.length; i++) {
      const entry = imageEntries[i]!
      const filename = `${timestamp}${imageEntries.length > 1 ? `-${i + 1}` : ''}.png`
      const filePath = join(outDir, filename)

      if (entry.dataUrl) {
        // Handle both "data:image/...;base64,<data>" and raw base64
        const b64 = entry.dataUrl.includes(',')
          ? entry.dataUrl.split(',')[1]!
          : entry.dataUrl
        writeFileSync(filePath, Buffer.from(b64, 'base64'))
        log(`saved (base64): ${filePath}`)
        filePaths.push(filePath)
      } else if (entry.remoteUrl) {
        log(`downloading remote URL: ${entry.remoteUrl.slice(0, 80)}...`)
        const imgResp = await fetch(entry.remoteUrl, { signal: abortController.signal })
        writeFileSync(filePath, Buffer.from(await imgResp.arrayBuffer()))
        log(`saved (remote): ${filePath}`)
        filePaths.push(filePath)
      } else {
        log(`WARN: entry ${i} has neither dataUrl nor remoteUrl, skipped`)
      }
    }

    log(`done — ${filePaths.length} file(s) saved, model=${responseModel ?? '(unknown)'}`)
    return {
      data: { filePaths, model: responseModel },
    }
  },

  mapToolResultToToolResultBlockParam(output, toolUseID) {
    let text: string
    if (output.error) {
      text = `Error: ${output.error}`
    } else {
      const modelLine = output.model ? `\nmodel: ${output.model}` : ''
      text = `Generated ${output.filePaths.length} image(s):\n${output.filePaths.join('\n')}${modelLine}`
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: text,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
