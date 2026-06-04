import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { getMultimodalConfig } from '../../utils/multimodalConfig.js'
import { getCwd } from '../../utils/cwd.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { DESCRIPTION, VIDEO_GENERATE_TOOL_NAME } from './prompt.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    prompt: z.string().describe('Text description of the video to generate'),
    model: z
      .string()
      .optional()
      .describe('Model name to use (e.g. google/veo-3.1, alibaba/wan-2.7)'),
    resolution: z
      .string()
      .optional()
      .describe('Video resolution: 480p / 720p / 1080p / 1K / 2K / 4K (default: 720p)'),
    aspect_ratio: z
      .string()
      .optional()
      .describe('Aspect ratio, e.g. "16:9", "9:16", "1:1"'),
    duration: z
      .number()
      .int()
      .min(1)
      .max(60)
      .optional()
      .describe('Duration of the video in seconds'),
    generate_audio: z
      .boolean()
      .optional()
      .describe('Whether to generate audio (default: true, if model supports it)'),
    frame_image: z
      .string()
      .optional()
      .describe(
        'First-frame image for image-to-video mode. Accepts a public URL (https://...) or a local file path.',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    filePath: z.string().optional(),
    model: z.string().optional(),
    error: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const VideoGenerateTool = buildTool({
  name: VIDEO_GENERATE_TOOL_NAME,
  searchHint: 'generate videos from text prompts using AI',
  maxResultSizeChars: 10_000,

  async description(input) {
    const { prompt } = input as { prompt?: string }
    return prompt ? `Generate video: "${prompt}"` : 'Generate a video'
  },

  userFacingName() {
    return 'VideoGenerate'
  },

  getActivityDescription(input) {
    const { prompt } = (input ?? {}) as { prompt?: string }
    return prompt ? `Generating video: ${prompt.slice(0, 60)}` : 'Generating video'
  },

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  get outputSchema(): OutputSchema {
    return outputSchema()
  },

  isEnabled() {
    return true
  },

  isConcurrencySafe() {
    return true
  },

  isReadOnly() {
    return false
  },

  toAutoClassifierInput(input) {
    return `video: ${input.prompt}`
  },

  async prompt() {
    return DESCRIPTION
  },

  renderToolUseMessage,
  renderToolResultMessage,

  async call(
    { prompt, model, resolution, aspect_ratio, duration, generate_audio, frame_image },
    { abortController },
  ) {
    const config = getMultimodalConfig()
    const baseUrl = config.video_url
    const apiKey = config.video_key
    const defaultModel = config.video_default_model
    const allowedModels = config.video_models ?? []

    // ── Logging setup ──
    const outDir = join(getCwd(), 'video_generated')
    mkdirSync(outDir, { recursive: true })
    const logFile = join(outDir, 'video-generate.log')
    function log(msg: string) {
      const line = `[${new Date().toISOString()}] ${msg}\n`
      appendFileSync(logFile, line)
    }

    log(`--- VideoGenerate called ---`)
    log(`prompt: ${prompt}`)

    if (!baseUrl || !apiKey) {
      const err = 'Video generation API not configured. Please set the Video Base URL and Video API Key in Settings → Multimodal API.'
      log(`ERROR: ${err}`)
      return { data: { error: err } }
    }

    // Model resolution (same fuzzy-match logic as ImageGenerateTool)
    let resolvedModel: string | undefined
    if (!model) {
      resolvedModel = defaultModel
      log(`model: not specified → using default "${resolvedModel ?? '(none)'}"`)
    } else if (allowedModels.length > 0) {
      const exact = allowedModels.find(m => m === model)
      const suffix = allowedModels.find(m => m.endsWith(`/${model}`) || m.endsWith(model))
      const partial = allowedModels.find(m => m.includes(model))
      const matched = exact ?? suffix ?? partial
      if (matched) {
        resolvedModel = matched
        log(`model: "${model}" fuzzy-matched to "${matched}"${matched !== model ? ` (expanded)` : ''}`)
      } else {
        resolvedModel = defaultModel
        log(`model: "${model}" not in video_models [${allowedModels.join(', ')}] → falling back to default "${resolvedModel ?? '(none)'}"`)
      }
    } else {
      resolvedModel = model
      log(`model: using "${resolvedModel}" (no allowlist)`)
    }

    if (!resolvedModel) {
      const err = 'No model resolved. Set "video_default_model" in $CLAUDE_CONFIG_DIR/multimodal_config.json or specify a model.'
      log(`ERROR: ${err}`)
      return { data: { error: err } }
    }

    const base = baseUrl.replace(/\/$/, '')
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }

    // ── Resolve frame image (image-to-video) ──
    const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])
    const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'webm', 'mkv', 'flv', 'wmv'])

    let frameImageUrl: string | undefined
    if (frame_image) {
      if (frame_image.startsWith('http://') || frame_image.startsWith('https://')) {
        frameImageUrl = frame_image
        log(`frame_image: using remote URL ${frame_image.slice(0, 80)}`)
      } else {
        const ext = frame_image.split('.').pop()?.toLowerCase() ?? ''
        if (VIDEO_EXTENSIONS.has(ext)) {
          const err = `frame_image must be an image file (png/jpg/webp/gif), not a video file (.${ext}). To use a video as reference, extract a frame from it first.`
          log(`ERROR: ${err}`)
          return { data: { error: err } }
        }
        if (!IMAGE_EXTENSIONS.has(ext)) {
          const err = `frame_image has unrecognized extension ".${ext}". Supported formats: png, jpg, jpeg, webp, gif.`
          log(`ERROR: ${err}`)
          return { data: { error: err } }
        }
        const buf = readFileSync(frame_image)
        const mime =
          ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
          : ext === 'webp' ? 'image/webp'
          : ext === 'gif' ? 'image/gif'
          : 'image/png'
        frameImageUrl = `data:${mime};base64,${buf.toString('base64')}`
        log(`frame_image: loaded local file ${frame_image} (${buf.length} bytes, ${mime})`)
      }
    }

    // ── Step 1: Submit job ──
    const submitEndpoint = `${base}/v1/videos`
    const submitBody: Record<string, unknown> = { model: resolvedModel, prompt }
    if (resolution) submitBody.resolution = resolution
    if (aspect_ratio) submitBody.aspect_ratio = aspect_ratio
    if (duration !== undefined) submitBody.duration = duration
    if (generate_audio !== undefined) submitBody.generate_audio = generate_audio
    if (frameImageUrl) {
      submitBody.frame_images = [
        {
          type: 'image_url',
          image_url: { url: frameImageUrl },
          frame_type: 'first_frame',
        },
      ]
    }

    log(`submitting job: POST ${submitEndpoint} model=${resolvedModel} mode=${frameImageUrl ? 'img2video' : 'text2video'}`)

    type SubmitResponse = {
      id?: string
      polling_url?: string
      status?: string
      error?: string | { message?: string }
    }

    let jobId: string
    let pollingUrl: string

    try {
      const submitResp = await fetch(submitEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(submitBody),
        signal: abortController.signal,
      })
      const submitData = (await submitResp.json()) as SubmitResponse
      log(`submit response: HTTP ${submitResp.status} ${submitResp.statusText}`)

      if (!submitResp.ok) {
        let msg: string
        if (typeof submitData.error === 'string') {
          msg = submitData.error
        } else if (typeof submitData.error === 'object' && submitData.error?.message) {
          msg = submitData.error.message
        } else {
          msg = `HTTP ${submitResp.status} ${submitResp.statusText}`
        }
        log(`ERROR: submit failed — ${msg}`)
        return { data: { error: msg } }
      }

      if (!submitData.id || !submitData.polling_url) {
        const msg = `Unexpected submit response (missing id/polling_url): ${JSON.stringify(submitData)}`
        log(`ERROR: ${msg}`)
        return { data: { error: msg } }
      }

      jobId = submitData.id
      pollingUrl = submitData.polling_url
      log(`job submitted: id=${jobId}, polling_url=${pollingUrl}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`ERROR: submit threw — ${msg}`)
      return { data: { error: msg } }
    }

    // ── Step 2: Poll for completion ──
    type PollResponse = {
      id: string
      status: 'pending' | 'in_progress' | 'completed' | 'failed'
      polling_url: string
      unsigned_urls?: string[]
      usage?: { cost: number; is_byok: boolean }
      error?: string
    }

    const POLL_INTERVAL_MS = 30_000
    const MAX_POLLS = 60 // 30 minutes max

    let pollResult: PollResponse | undefined
    for (let i = 0; i < MAX_POLLS; i++) {
      log(`polling (attempt ${i + 1}/${MAX_POLLS}), waiting ${POLL_INTERVAL_MS / 1000}s...`)
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

      try {
        const pollResp = await fetch(pollingUrl, {
          headers,
          signal: abortController.signal,
        })
        const pollData = (await pollResp.json()) as PollResponse
        log(`poll ${i + 1}: HTTP ${pollResp.status}, status=${pollData.status}`)

        if (!pollResp.ok) {
          log(`WARN: poll returned HTTP ${pollResp.status}, will retry`)
          continue
        }

        if (pollData.status === 'completed' || pollData.status === 'failed') {
          pollResult = pollData
          break
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`WARN: poll threw — ${msg}, will retry`)
      }
    }

    if (!pollResult) {
      const msg = `Video generation timed out after ${(MAX_POLLS * POLL_INTERVAL_MS) / 60_000} minutes`
      log(`ERROR: ${msg}`)
      return { data: { error: msg } }
    }

    if (pollResult.status === 'failed') {
      const msg = pollResult.error ?? 'Video generation failed (no details)'
      log(`ERROR: job failed — ${msg}`)
      return { data: { error: msg } }
    }

    const videoUrl = pollResult.unsigned_urls?.[0]
    if (!videoUrl) {
      const msg = 'Job completed but no video URL returned'
      log(`ERROR: ${msg}`)
      return { data: { error: msg } }
    }

    // ── Step 3: Download video ──
    log(`downloading video from: ${videoUrl.slice(0, 80)}...`)
    try {
      const dlResp = await fetch(videoUrl, {
        headers,
        signal: abortController.signal,
      })
      if (!dlResp.ok) {
        const msg = `Download failed: HTTP ${dlResp.status} ${dlResp.statusText}`
        log(`ERROR: ${msg}`)
        return { data: { error: msg } }
      }

      const arrayBuffer = await dlResp.arrayBuffer()
      const timestamp = Date.now()
      const filename = `${timestamp}.mp4`
      const filePath = join(outDir, filename)
      writeFileSync(filePath, Buffer.from(arrayBuffer))
      log(`saved: ${filePath} (${arrayBuffer.byteLength} bytes), model=${resolvedModel}`)

      return { data: { filePath, model: resolvedModel } }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`ERROR: download threw — ${msg}`)
      return { data: { error: msg } }
    }
  },

  mapToolResultToToolResultBlockParam(output, toolUseID) {
    let text: string
    if (output.error) {
      text = `Error: ${output.error}`
    } else {
      const modelLine = output.model ? `\nmodel: ${output.model}` : ''
      text = `Generated video:\n${output.filePath ?? '(unknown path)'}${modelLine}`
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: text,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
