import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { type AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod/v4'
import {
  buildTool,
  type Tool,
  type ToolDef,
  type ToolUseContext,
} from '../../Tool.js'
import { getGlobalSkillRoot } from '../../skills/globalSkillPaths.js'
import { execFileNoThrowWithCwd } from '../../utils/execFileNoThrow.js'
import { lazySchema } from '../../utils/lazySchema.js'

const TOOL_NAME = 'WebAppPlaywright' as const
const PLAYWRIGHT_SCRIPT = join(
  getGlobalSkillRoot('develop-web-game'),
  'scripts',
  'web_game_playwright_client.js',
)
const requireFromBackend = createRequire(import.meta.url)

const buttonSchema = z.enum([
  'up',
  'down',
  'left',
  'right',
  'enter',
  'space',
  'a',
  'b',
  'left_mouse_button',
  'right_mouse_button',
])

const actionStepSchema = z.strictObject({
  selector: z.string().trim().min(1).max(512).optional(),
  action: z
    .enum(['click', 'fill', 'check', 'uncheck', 'select', 'press'])
    .optional(),
  value: z.string().max(10_000).optional(),
  buttons: z.array(buttonSchema).max(12).optional(),
  frames: z.number().int().min(1).max(600).optional(),
  mouse_x: z.number().finite().optional(),
  mouse_y: z.number().finite().optional(),
})

const inputSchema = lazySchema(() =>
  z.strictObject({
    actions: z.strictObject({
      steps: z.array(actionStepSchema).min(1).max(100),
    }),
    click_selector: z.string().trim().min(1).max(256).optional(),
    iterations: z.number().int().min(1).max(10).optional().default(1),
    pause_ms: z.number().int().min(0).max(5_000).optional().default(250),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.strictObject({
    status: z.enum(['passed', 'failed', 'unavailable']),
    code: z.string(),
    run_directory: z.string(),
    screenshots: z.array(z.string()),
    states: z.array(
      z.strictObject({
        path: z.string(),
        content: z.string(),
      }),
    ),
    console_errors: z.array(z.json()),
    diagnostics: z.string(),
    exit_code: z.number().int(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

function isWithin(root: string, candidate: string, allowRoot = false): boolean {
  const relation = relative(root, candidate)
  return (
    (allowRoot && relation === '') ||
    (relation !== '' && !relation.startsWith('..') && !isAbsolute(relation))
  )
}

export async function validatePlaywrightAppDirectory(
  outputDir: string,
  workspaceDir: string,
): Promise<{ appDir: string; entryFile: string }> {
  const allowedRoots = [
    resolve(workspaceDir, 'app_generated'),
    resolve(workspaceDir, '.webapp-staging'),
  ]
  const lexicalAppDir = resolve(outputDir)
  const allowedRoot = allowedRoots.find(root => isWithin(root, lexicalAppDir))
  if (!allowedRoot) {
    throw new Error(
      'INVALID_PLAYWRIGHT_APP_DIR: output is outside approved app roots',
    )
  }

  const lexicalEntry = join(lexicalAppDir, 'index.html')
  const [realAllowedRoot, appDir, entryFile, entryStats] = await Promise.all([
    realpath(allowedRoot),
    realpath(lexicalAppDir),
    realpath(lexicalEntry),
    stat(lexicalEntry),
  ])
  if (!isWithin(realAllowedRoot, appDir)) {
    throw new Error(
      'INVALID_PLAYWRIGHT_APP_DIR: output resolves outside approved app roots',
    )
  }
  if (!isWithin(appDir, entryFile) || !entryStats.isFile()) {
    throw new Error(
      'INVALID_PLAYWRIGHT_APP_DIR: index.html must be inside the app',
    )
  }
  return { appDir, entryFile }
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>(resolveClose => {
    server.close(() => resolveClose())
    server.closeAllConnections?.()
  })
}

async function startStaticAppServer(appDir: string): Promise<{
  url: string
  close(): Promise<void>
}> {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (requestUrl.pathname === '/favicon.ico') {
        response.writeHead(204).end()
        return
      }
      if (request.method === 'POST' && requestUrl.pathname === '/events') {
        request.resume()
        response.writeHead(204).end()
        return
      }
      const decodedPath = decodeURIComponent(requestUrl.pathname)
      const relativePath =
        decodedPath === '/' ? 'index.html' : decodedPath.slice(1)
      const lexicalPath = resolve(appDir, relativePath)
      if (!isWithin(appDir, lexicalPath)) {
        response.writeHead(403).end('Forbidden')
        return
      }
      const filePath = await realpath(lexicalPath)
      const fileStats = await stat(filePath)
      if (!isWithin(appDir, filePath) || !fileStats.isFile()) {
        response.writeHead(403).end('Forbidden')
        return
      }
      response.setHeader('Content-Type', contentType(filePath))
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('Content-Length', String(fileStats.size))
      response.writeHead(200)
      createReadStream(filePath)
        .on('error', () => response.destroy())
        .pipe(response)
    } catch {
      response.writeHead(404).end('Not found')
    }
  })

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })
  const address = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${address.port}/index.html`,
    close: () => closeServer(server),
  }
}

function resolvePlaywrightModuleUrl(): string | null {
  try {
    return pathToFileURL(requireFromBackend.resolve('playwright')).href
  } catch {
    return null
  }
}

export async function findPlaywrightBrowserExecutable(
  searchRoots: readonly string[] = [
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH
      ? [process.env.PLAYWRIGHT_BROWSERS_PATH]
      : []),
    join(homedir(), '.cache', 'ms-playwright'),
  ],
): Promise<string | undefined> {
  for (const root of searchRoots) {
    const names = await readdir(root).catch(() => [])
    const chromiumDirectories = names
      .filter(name => /^chromium-\d+$/.test(name))
      .sort((left, right) => {
        const leftRevision = Number(left.slice('chromium-'.length))
        const rightRevision = Number(right.slice('chromium-'.length))
        return rightRevision - leftRevision
      })
    for (const directory of chromiumDirectories) {
      for (const relativeExecutable of [
        join('chrome-linux64', 'chrome'),
        join('chrome-linux', 'chrome'),
      ]) {
        const candidate = join(root, directory, relativeExecutable)
        const candidateStats = await stat(candidate).catch(() => null)
        if (candidateStats?.isFile()) return candidate
      }
    }
  }
  return undefined
}

async function readRunArtifacts(runDirectory: string): Promise<{
  screenshots: string[]
  states: Array<{ path: string; content: string }>
  consoleErrors: unknown[]
}> {
  const names = (await readdir(runDirectory)).sort()
  const screenshots = names
    .filter(name => /^shot-\d+\.png$/.test(name))
    .map(name => join(runDirectory, name))
  const states = await Promise.all(
    names
      .filter(name => /^state-\d+\.json$/.test(name))
      .map(async name => {
        const path = join(runDirectory, name)
        return {
          path,
          content: (await readFile(path, 'utf8')).slice(0, 20_000),
        }
      }),
  )
  const consoleErrors: unknown[] = []
  for (const name of names.filter(name => /^errors-\d+\.json$/.test(name))) {
    try {
      const parsed = JSON.parse(
        await readFile(join(runDirectory, name), 'utf8'),
      )
      if (Array.isArray(parsed)) consoleErrors.push(...parsed)
      else consoleErrors.push(parsed)
    } catch {
      consoleErrors.push({ type: 'invalid_error_log', file: name })
    }
  }
  return { screenshots, states, consoleErrors }
}

function unavailableDiagnostic(diagnostics: string): boolean {
  return /Cannot find package ['"]playwright|Executable doesn't exist|browserType\.launch/i.test(
    diagnostics,
  )
}

export async function runWebAppPlaywrightVerification(input: {
  outputDir: string
  workspaceDir: string
  value: z.input<InputSchema>
  context: ToolUseContext
}): Promise<Output> {
  const value = inputSchema().parse(input.value)
  const { appDir } = await validatePlaywrightAppDirectory(
    input.outputDir,
    input.workspaceDir,
  )
  const runRoot = resolve(input.workspaceDir, '.webapp-runs')
  await mkdir(runRoot, { recursive: true })
  const runDirectory = join(runRoot, randomUUID())
  await mkdir(runDirectory)
  const actionsFile = join(runDirectory, 'actions.json')
  await writeFile(actionsFile, JSON.stringify(value.actions), 'utf8')

  const playwrightModuleUrl = resolvePlaywrightModuleUrl()
  if (!playwrightModuleUrl) {
    return outputSchema().parse({
      status: 'unavailable',
      code: 'playwright_not_installed',
      run_directory: runDirectory,
      screenshots: [],
      states: [],
      console_errors: [],
      diagnostics: 'The backend Playwright package is not installed.',
      exit_code: 1,
    })
  }

  const appServer = await startStaticAppServer(appDir)
  try {
    const fallbackBrowserExecutable = await findPlaywrightBrowserExecutable()
    const args = [
      PLAYWRIGHT_SCRIPT,
      '--url',
      appServer.url,
      '--actions-file',
      actionsFile,
      '--screenshot-dir',
      runDirectory,
      '--iterations',
      String(value.iterations),
      '--pause-ms',
      String(value.pause_ms),
      '--headless',
      'true',
    ]
    if (value.click_selector) {
      args.push('--click-selector', value.click_selector)
    }
    const execution = await execFileNoThrowWithCwd(process.execPath, args, {
      cwd: appDir,
      abortSignal: input.context.abortController.signal,
      timeout: 120_000,
      maxBuffer: 1_000_000,
      preserveOutputOnError: true,
      env: {
        ...process.env,
        WEB_APP_PLAYWRIGHT_MODULE: playwrightModuleUrl,
        ...(fallbackBrowserExecutable
          ? { WEB_APP_PLAYWRIGHT_EXECUTABLE_PATH: fallbackBrowserExecutable }
          : {}),
      },
    })
    const artifacts = await readRunArtifacts(runDirectory)
    const diagnostics =
      `${fallbackBrowserExecutable ? `Browser executable: ${fallbackBrowserExecutable}\n` : ''}${execution.stderr}\n${execution.stdout}`
        .trim()
        .slice(0, 20_000)
    const unavailable = unavailableDiagnostic(diagnostics)
    const passed =
      execution.code === 0 &&
      artifacts.consoleErrors.length === 0 &&
      artifacts.screenshots.length > 0 &&
      artifacts.states.length > 0
    return outputSchema().parse({
      status: passed ? 'passed' : unavailable ? 'unavailable' : 'failed',
      code: passed
        ? 'verification_passed'
        : unavailable
          ? 'playwright_runtime_unavailable'
          : 'verification_failed',
      run_directory: runDirectory,
      screenshots: artifacts.screenshots,
      states: artifacts.states,
      console_errors: artifacts.consoleErrors,
      diagnostics,
      exit_code: execution.code,
    })
  } finally {
    await appServer.close()
  }
}

export function createWebAppPlaywrightTool(input: {
  outputDir: string
  workspaceDir: string
}): Tool {
  const boundOutputDir = resolve(input.outputDir)
  const boundWorkspaceDir = resolve(input.workspaceDir)

  return buildTool({
    name: TOOL_NAME,
    maxResultSizeChars: 100_000,
    strict: true,
    async description() {
      return 'Exercise the currently assigned Web App in one browser session with ordered DOM actions (selector + click/fill/check/uncheck/select/press) and optional canvas/keyboard actions, then return screenshots, rendered state, action failures, and console errors. Paths and URL are bound by the Tool.'
    },
    async prompt() {
      return 'Test only the current renderer output. For multi-step DOM apps, put each ordered selector action in actions.steps so state persists within one browser session. Inspect returned screenshots with Read, compare them with rendered state, fix defects, and call this Tool again as needed.'
    },
    get inputSchema(): InputSchema {
      return inputSchema()
    },
    get outputSchema(): OutputSchema {
      return outputSchema()
    },
    userFacingName() {
      return 'Web App Playwright verification'
    },
    isEnabled() {
      return true
    },
    isConcurrencySafe() {
      return false
    },
    isReadOnly() {
      return false
    },
    interruptBehavior() {
      return 'cancel'
    },
    toAutoClassifierInput(value) {
      return JSON.stringify(value)
    },
    async checkPermissions(value) {
      return { behavior: 'allow', updatedInput: value }
    },
    renderToolUseMessage() {
      return 'Verify Web App interactions'
    },
    renderToolUseRejectedMessage() {
      return 'Web App verification rejected'
    },
    renderToolUseErrorMessage() {
      return 'Web App verification failed'
    },
    renderToolResultMessage(output) {
      return `${output.status}: ${output.screenshots.length} screenshot(s), ${output.console_errors.length} console error(s)`
    },
    async call(value, context) {
      return {
        data: await runWebAppPlaywrightVerification({
          outputDir: boundOutputDir,
          workspaceDir: boundWorkspaceDir,
          value,
          context,
        }),
      }
    },
    mapToolResultToToolResultBlockParam(
      content: Output,
      toolUseID: string,
    ): ToolResultBlockParam {
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: JSON.stringify(content),
      }
    },
  } satisfies ToolDef<InputSchema, Output>)
}
