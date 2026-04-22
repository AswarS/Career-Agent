import { statSync } from 'fs'
import ignore from 'ignore'
import * as path from 'path'
import {
  CLAUDE_CONFIG_DIRECTORIES,
  loadMarkdownFilesForSubdir,
} from 'src/utils/markdownConfigLoader.js'
import type { SuggestionItem } from '../components/PromptInput/PromptInputFooterSuggestions.js'
import {
  CHUNK_MS,
  FileIndex,
  yieldToEventLoop,
} from '../native-ts/file-index/index.js'
import { logEvent } from '../services/analytics/index.js'
import type { FileSuggestionCommandInput } from '../types/fileSuggestion.js'
import { getState } from '../bootstrap/state.js'
import { getGlobalConfig } from '../utils/config.js'
import { getCwd } from '../utils/cwd.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { execFileNoThrowWithCwd } from '../utils/execFileNoThrow.js'
import { getFsImplementation } from '../utils/fsOperations.js'
import { findGitRoot, gitExe } from '../utils/git.js'
import {
  createBaseHookInput,
  executeFileSuggestionCommand,
} from '../utils/hooks.js'
import { logError } from '../utils/log.js'
import { expandPath } from '../utils/path.js'
import { ripGrep } from '../utils/ripgrep.js'
import { getInitialSettings } from '../utils/settings/settings.js'
import { createSignal } from '../utils/signal.js'

// All mutable state is now per-session via getState() for multi-user isolation.
// Accessor helpers for STATE fields:

function _s() {
  return getState()
}
function _fileIndex(): FileIndex | null {
  return _s().fsFileIndex as FileIndex | null
}
function _setFileIndex(v: FileIndex | null): void {
  _s().fsFileIndex = v
}
function _fileListRefreshPromise(): Promise<FileIndex> | null {
  return _s().fsFileListRefreshPromise as Promise<FileIndex> | null
}
function _setFileListRefreshPromise(v: Promise<FileIndex> | null): void {
  _s().fsFileListRefreshPromise = v
}
function _cacheGeneration(): number {
  return _s().fsCacheGeneration
}
function _incrCacheGeneration(): void {
  _s().fsCacheGeneration++
}
function _untrackedFetchPromise(): Promise<void> | null {
  return _s().fsUntrackedFetchPromise
}
function _setUntrackedFetchPromise(v: Promise<void> | null): void {
  _s().fsUntrackedFetchPromise = v
}
function _cachedTrackedFiles(): string[] {
  return _s().fsCachedTrackedFiles
}
function _setCachedTrackedFiles(v: string[]): void {
  _s().fsCachedTrackedFiles = v
}
function _cachedConfigFiles(): string[] {
  return _s().fsCachedConfigFiles
}
function _setCachedConfigFiles(v: string[]): void {
  _s().fsCachedConfigFiles = v
}
function _cachedTrackedDirs(): string[] {
  return _s().fsCachedTrackedDirs
}
function _setCachedTrackedDirs(v: string[]): void {
  _s().fsCachedTrackedDirs = v
}
function _ignorePatternsCache(): ReturnType<typeof ignore> | null {
  return _s().fsIgnorePatternsCache as ReturnType<typeof ignore> | null
}
function _setIgnorePatternsCache(v: ReturnType<typeof ignore> | null): void {
  _s().fsIgnorePatternsCache = v
}
function _ignorePatternsCacheKey(): string | null {
  return _s().fsIgnorePatternsCacheKey
}
function _setIgnorePatternsCacheKey(v: string | null): void {
  _s().fsIgnorePatternsCacheKey = v
}
function _lastRefreshMs(): number {
  return _s().fsLastRefreshMs
}
function _setLastRefreshMs(v: number): void {
  _s().fsLastRefreshMs = v
}
function _lastGitIndexMtime(): number | null {
  return _s().fsLastGitIndexMtime
}
function _setLastGitIndexMtime(v: number | null): void {
  _s().fsLastGitIndexMtime = v
}
function _loadedTrackedSignature(): string | null {
  return _s().fsLoadedTrackedSignature
}
function _setLoadedTrackedSignature(v: string | null): void {
  _s().fsLoadedTrackedSignature = v
}
function _loadedMergedSignature(): string | null {
  return _s().fsLoadedMergedSignature
}
function _setLoadedMergedSignature(v: string | null): void {
  _s().fsLoadedMergedSignature = v
}

// Lazily constructed per-session singleton
function getFileIndex(): FileIndex {
  if (!_fileIndex()) {
    _setFileIndex(new FileIndex())
  }
  return _fileIndex()!
}

// Signal fired when an in-progress index build completes. Lets the
// typeahead UI re-run its last search so partial results upgrade to full.
const indexBuildComplete = createSignal()
export const onIndexBuildComplete = indexBuildComplete.subscribe

/**
 * Clear all file suggestion caches.
 * Call this when resuming a session to ensure fresh file discovery.
 */
export function clearFileSuggestionCaches(): void {
  _setFileIndex(null)
  _setFileListRefreshPromise(null)
  _incrCacheGeneration()
  _setUntrackedFetchPromise(null)
  _setCachedTrackedFiles([])
  _setCachedConfigFiles([])
  _setCachedTrackedDirs([])
  indexBuildComplete.clear()
  _setIgnorePatternsCache(null)
  _setIgnorePatternsCacheKey(null)
  _setLastRefreshMs(0)
  _setLastGitIndexMtime(null)
  _setLoadedTrackedSignature(null)
  _setLoadedMergedSignature(null)
}

/**
 * Content hash of a path list. A length|first|last sample misses renames of
 * middle files (same length, same endpoints → stale entry stuck in nucleo).
 *
 * Samples every Nth path (plus length). On a 346k-path list this hashes ~700
 * paths instead of 14MB — enough to catch git operations (checkout, rebase,
 * add/rm) while running in <1ms. A single mid-list rename that happens to
 * fall between samples will miss the rebuild, but the 5s refresh floor picks
 * it up on the next cycle.
 */
export function pathListSignature(paths: string[]): string {
  const n = paths.length
  const stride = Math.max(1, Math.floor(n / 500))
  let h = 0x811c9dc5 | 0
  for (let i = 0; i < n; i += stride) {
    const p = paths[i]!
    for (let j = 0; j < p.length; j++) {
      h = ((h ^ p.charCodeAt(j)) * 0x01000193) | 0
    }
    h = (h * 0x01000193) | 0
  }
  // Stride starts at 0 (first path always hashed); explicitly include last
  // so single-file add/rm at the tail is caught
  if (n > 0) {
    const last = paths[n - 1]!
    for (let j = 0; j < last.length; j++) {
      h = ((h ^ last.charCodeAt(j)) * 0x01000193) | 0
    }
  }
  return `${n}:${(h >>> 0).toString(16)}`
}

/**
 * Stat .git/index to detect git state changes without spawning git ls-files.
 * Returns null for worktrees (.git is a file → ENOTDIR), fresh repos with no
 * index yet (ENOENT), and non-git dirs — caller falls back to time throttle.
 */
function getGitIndexMtime(): number | null {
  const repoRoot = findGitRoot(getCwd())
  if (!repoRoot) return null
  try {
    // eslint-disable-next-line custom-rules/no-sync-fs -- mtimeMs is the operation here, not a pre-check. findGitRoot above already stat-walks synchronously; one more stat is marginal vs spawning git ls-files on every keystroke. Async would force startBackgroundCacheRefresh to become async, breaking the synchronous fileListRefreshPromise contract at the cold-start await site.
    return statSync(path.join(repoRoot, '.git', 'index')).mtimeMs
  } catch {
    return null
  }
}

/**
 * Normalize git paths relative to originalCwd
 */
function normalizeGitPaths(
  files: string[],
  repoRoot: string,
  originalCwd: string,
): string[] {
  if (originalCwd === repoRoot) {
    return files
  }
  return files.map(f => {
    const absolutePath = path.join(repoRoot, f)
    return path.relative(originalCwd, absolutePath)
  })
}

/**
 * Merge already-normalized untracked files into the cache
 */
async function mergeUntrackedIntoNormalizedCache(
  normalizedUntracked: string[],
): Promise<void> {
  if (normalizedUntracked.length === 0) return
  if (!_fileIndex() || _cachedTrackedFiles().length === 0) return

  const untrackedDirs = await getDirectoryNamesAsync(normalizedUntracked)
  const allPaths = [
    ..._cachedTrackedFiles(),
    ..._cachedConfigFiles(),
    ..._cachedTrackedDirs(),
    ...normalizedUntracked,
    ...untrackedDirs,
  ]
  const sig = pathListSignature(allPaths)
  if (sig === _loadedMergedSignature()) {
    logForDebugging(
      `[FileIndex] skipped index rebuild — merged paths unchanged`,
    )
    return
  }
  await getFileIndex().loadFromFileListAsync(allPaths).done
  _setLoadedMergedSignature(sig)
  logForDebugging(
    `[FileIndex] rebuilt index with ${_cachedTrackedFiles().length} tracked + ${normalizedUntracked.length} untracked files`,
  )
}

/**
 * Load ripgrep-specific ignore patterns from .ignore or .rgignore files
 * Returns an ignore instance if patterns were found, null otherwise
 * Results are cached per repoRoot:cwd combination
 */
async function loadRipgrepIgnorePatterns(
  repoRoot: string,
  cwd: string,
): Promise<ReturnType<typeof ignore> | null> {
  const cacheKey = `${repoRoot}:${cwd}`

  // Return cached result if available
  if (_ignorePatternsCacheKey() === cacheKey) {
    return _ignorePatternsCache()
  }

  const fs = getFsImplementation()
  const ignoreFiles = ['.ignore', '.rgignore']
  const directories = [...new Set([repoRoot, cwd])]

  const ig = ignore()
  let hasPatterns = false

  const paths = directories.flatMap(dir =>
    ignoreFiles.map(f => path.join(dir, f)),
  )
  const contents = await Promise.all(
    paths.map(p => fs.readFile(p, { encoding: 'utf8' }).catch(() => null)),
  )
  for (const [i, content] of contents.entries()) {
    if (content === null) continue
    ig.add(content)
    hasPatterns = true
    logForDebugging(`[FileIndex] loaded ignore patterns from ${paths[i]}`)
  }

  const result = hasPatterns ? ig : null
  _setIgnorePatternsCache(result)
  _setIgnorePatternsCacheKey(cacheKey)

  return result
}

/**
 * Get files using git ls-files (much faster than ripgrep for git repos)
 * Returns tracked files immediately, fetches untracked in background
 * @param respectGitignore If true, excludes gitignored files from untracked results
 *
 * Note: Unlike ripgrep --follow, git ls-files doesn't follow symlinks.
 * This is intentional as git tracks symlinks as symlinks.
 */
async function getFilesUsingGit(
  abortSignal: AbortSignal,
  respectGitignore: boolean,
): Promise<string[] | null> {
  const startTime = Date.now()
  logForDebugging(`[FileIndex] getFilesUsingGit called`)

  // Check if we're in a git repo. findGitRoot is LRU-memoized per path.
  const repoRoot = findGitRoot(getCwd())
  if (!repoRoot) {
    logForDebugging(`[FileIndex] not a git repo, returning null`)
    return null
  }

  try {
    const cwd = getCwd()

    // Get tracked files (fast - reads from git index)
    // Run from repoRoot so paths are relative to repo root, not CWD
    const lsFilesStart = Date.now()
    const trackedResult = await execFileNoThrowWithCwd(
      gitExe(),
      ['-c', 'core.quotepath=false', 'ls-files', '--recurse-submodules'],
      { timeout: 5000, abortSignal, cwd: repoRoot },
    )
    logForDebugging(
      `[FileIndex] git ls-files (tracked) took ${Date.now() - lsFilesStart}ms`,
    )

    if (trackedResult.code !== 0) {
      logForDebugging(
        `[FileIndex] git ls-files failed (code=${trackedResult.code}, stderr=${trackedResult.stderr}), falling back to ripgrep`,
      )
      return null
    }

    const trackedFiles = trackedResult.stdout.trim().split('\n').filter(Boolean)

    // Normalize paths relative to the current working directory
    let normalizedTracked = normalizeGitPaths(trackedFiles, repoRoot, cwd)

    // Apply .ignore/.rgignore patterns if present (faster than falling back to ripgrep)
    const ignorePatterns = await loadRipgrepIgnorePatterns(repoRoot, cwd)
    if (ignorePatterns) {
      const beforeCount = normalizedTracked.length
      normalizedTracked = ignorePatterns.filter(normalizedTracked)
      logForDebugging(
        `[FileIndex] applied ignore patterns: ${beforeCount} -> ${normalizedTracked.length} files`,
      )
    }

    // Cache tracked files for later merge with untracked
    _setCachedTrackedFiles(normalizedTracked)

    const duration = Date.now() - startTime
    logForDebugging(
      `[FileIndex] git ls-files: ${normalizedTracked.length} tracked files in ${duration}ms`,
    )

    logEvent('tengu_file_suggestions_git_ls_files', {
      file_count: normalizedTracked.length,
      tracked_count: normalizedTracked.length,
      untracked_count: 0,
      duration_ms: duration,
    })

    // Start background fetch for untracked files (don't await)
    if (!_untrackedFetchPromise()) {
      const untrackedArgs = respectGitignore
        ? [
            '-c',
            'core.quotepath=false',
            'ls-files',
            '--others',
            '--exclude-standard',
          ]
        : ['-c', 'core.quotepath=false', 'ls-files', '--others']

      const generation = _cacheGeneration()
      _setUntrackedFetchPromise(execFileNoThrowWithCwd(gitExe(), untrackedArgs, {
        timeout: 10000,
        cwd: repoRoot,
      })
        .then(async untrackedResult => {
          if (generation !== _cacheGeneration()) {
            return // Cache was cleared; don't merge stale untracked files
          }
          if (untrackedResult.code === 0) {
            const rawUntrackedFiles = untrackedResult.stdout
              .trim()
              .split('\n')
              .filter(Boolean)

            // Normalize paths BEFORE applying ignore patterns (consistent with tracked files)
            let normalizedUntracked = normalizeGitPaths(
              rawUntrackedFiles,
              repoRoot,
              cwd,
            )

            // Apply .ignore/.rgignore patterns to normalized untracked files
            const ignorePatterns = await loadRipgrepIgnorePatterns(
              repoRoot,
              cwd,
            )
            if (ignorePatterns && normalizedUntracked.length > 0) {
              const beforeCount = normalizedUntracked.length
              normalizedUntracked = ignorePatterns.filter(normalizedUntracked)
              logForDebugging(
                `[FileIndex] applied ignore patterns to untracked: ${beforeCount} -> ${normalizedUntracked.length} files`,
              )
            }

            logForDebugging(
              `[FileIndex] background untracked fetch: ${normalizedUntracked.length} files`,
            )
            // Pass already-normalized files directly to merge function
            void mergeUntrackedIntoNormalizedCache(normalizedUntracked)
          }
        })
        .catch(error => {
          logForDebugging(
            `[FileIndex] background untracked fetch failed: ${error}`,
          )
        })
        .finally(() => {
          _setUntrackedFetchPromise(null)
        }))
    }

    return normalizedTracked
  } catch (error) {
    logForDebugging(`[FileIndex] git ls-files error: ${errorMessage(error)}`)
    return null
  }
}

/**
 * This function collects all parent directories for each file path
 * and returns a list of unique directory names with a trailing separator.
 * For example, if the input is ['src/index.js', 'src/utils/helpers.js'],
 * the output will be ['src/', 'src/utils/'].
 * @param files An array of file paths
 * @returns An array of unique directory names with a trailing separator
 */
export function getDirectoryNames(files: string[]): string[] {
  const directoryNames = new Set<string>()
  collectDirectoryNames(files, 0, files.length, directoryNames)
  return [...directoryNames].map(d => d + path.sep)
}

/**
 * Async variant: yields every ~10k files so 270k+ file lists don't block
 * the main thread for >10ms at a time.
 */
export async function getDirectoryNamesAsync(
  files: string[],
): Promise<string[]> {
  const directoryNames = new Set<string>()
  // Time-based chunking: yield after CHUNK_MS of work so slow machines get
  // smaller chunks and stay responsive.
  let chunkStart = performance.now()
  for (let i = 0; i < files.length; i++) {
    collectDirectoryNames(files, i, i + 1, directoryNames)
    if ((i & 0xff) === 0xff && performance.now() - chunkStart > CHUNK_MS) {
      await yieldToEventLoop()
      chunkStart = performance.now()
    }
  }
  return [...directoryNames].map(d => d + path.sep)
}

function collectDirectoryNames(
  files: string[],
  start: number,
  end: number,
  out: Set<string>,
): void {
  for (let i = start; i < end; i++) {
    let currentDir = path.dirname(files[i]!)
    // Early exit if we've already processed this directory and all its parents.
    // Root detection: path.dirname returns its input at the root (fixed point),
    // so we stop when dirname stops changing. Checking this before add() keeps
    // the root out of the result set (matching the old path.parse().root guard).
    // This avoids path.parse() which allocates a 5-field object per file.
    while (currentDir !== '.' && !out.has(currentDir)) {
      const parent = path.dirname(currentDir)
      if (parent === currentDir) break
      out.add(currentDir)
      currentDir = parent
    }
  }
}

/**
 * Gets additional files from Claude config directories
 */
async function getClaudeConfigFiles(cwd: string): Promise<string[]> {
  const markdownFileArrays = await Promise.all(
    CLAUDE_CONFIG_DIRECTORIES.map(subdir =>
      loadMarkdownFilesForSubdir(subdir, cwd),
    ),
  )
  return markdownFileArrays.flatMap(markdownFiles =>
    markdownFiles.map(f => f.filePath),
  )
}

/**
 * Gets project files using git ls-files (fast) or ripgrep (fallback)
 */
async function getProjectFiles(
  abortSignal: AbortSignal,
  respectGitignore: boolean,
): Promise<string[]> {
  logForDebugging(
    `[FileIndex] getProjectFiles called, respectGitignore=${respectGitignore}`,
  )

  // Try git ls-files first (much faster for git repos)
  const gitFiles = await getFilesUsingGit(abortSignal, respectGitignore)
  if (gitFiles !== null) {
    logForDebugging(
      `[FileIndex] using git ls-files result (${gitFiles.length} files)`,
    )
    return gitFiles
  }

  // Fall back to ripgrep
  logForDebugging(
    `[FileIndex] git ls-files returned null, falling back to ripgrep`,
  )
  const startTime = Date.now()
  const rgArgs = [
    '--files',
    '--follow',
    '--hidden',
    '--glob',
    '!.git/',
    '--glob',
    '!.svn/',
    '--glob',
    '!.hg/',
    '--glob',
    '!.bzr/',
    '--glob',
    '!.jj/',
    '--glob',
    '!.sl/',
  ]
  if (!respectGitignore) {
    rgArgs.push('--no-ignore-vcs')
  }

  const files = await ripGrep(rgArgs, '.', abortSignal)
  const relativePaths = files.map(f => path.relative(getCwd(), f))

  const duration = Date.now() - startTime
  logForDebugging(
    `[FileIndex] ripgrep: ${relativePaths.length} files in ${duration}ms`,
  )

  logEvent('tengu_file_suggestions_ripgrep', {
    file_count: relativePaths.length,
    duration_ms: duration,
  })

  return relativePaths
}

/**
 * Gets both files and their directory paths for providing path suggestions
 * Uses git ls-files for git repos (fast) or ripgrep as fallback
 * Returns a FileIndex populated for fast fuzzy search
 */
export async function getPathsForSuggestions(): Promise<FileIndex> {
  const signal = AbortSignal.timeout(10_000)
  const index = getFileIndex()

  try {
    // Check project settings first, then fall back to global config
    const projectSettings = getInitialSettings()
    const globalConfig = getGlobalConfig()
    const respectGitignore =
      projectSettings.respectGitignore ?? globalConfig.respectGitignore ?? true

    const cwd = getCwd()
    const [projectFiles, configFiles] = await Promise.all([
      getProjectFiles(signal, respectGitignore),
      getClaudeConfigFiles(cwd),
    ])

    // Cache for mergeUntrackedIntoNormalizedCache
    _setCachedConfigFiles(configFiles)

    const allFiles = [...projectFiles, ...configFiles]
    const directories = await getDirectoryNamesAsync(allFiles)
    _setCachedTrackedDirs(directories)
    const allPathsList = [...directories, ...allFiles]

    // Skip rebuild when the list is unchanged. This is the common case
    // during a typing session — git ls-files returns the same output.
    const sig = pathListSignature(allPathsList)
    if (sig !== _loadedTrackedSignature()) {
      // Await the full build so cold-start returns complete results. The
      // build yields every ~4ms so the UI stays responsive — user can keep
      // typing during the ~120ms wait without input lag.
      await index.loadFromFileListAsync(allPathsList).done
      _setLoadedTrackedSignature(sig)
      // We just replaced the merged index with tracked-only data. Force
      // the next untracked merge to rebuild even if its own sig matches.
      _setLoadedMergedSignature(null)
    } else {
      logForDebugging(
        `[FileIndex] skipped index rebuild — tracked paths unchanged`,
      )
    }
  } catch (error) {
    logError(error)
  }

  return index
}

/**
 * Finds the common prefix between two strings
 */
function findCommonPrefix(a: string, b: string): string {
  const minLength = Math.min(a.length, b.length)
  let i = 0
  while (i < minLength && a[i] === b[i]) {
    i++
  }
  return a.substring(0, i)
}

/**
 * Finds the longest common prefix among an array of suggestion items
 */
export function findLongestCommonPrefix(suggestions: SuggestionItem[]): string {
  if (suggestions.length === 0) return ''

  const strings = suggestions.map(item => item.displayText)
  let prefix = strings[0]!
  for (let i = 1; i < strings.length; i++) {
    const currentString = strings[i]!
    prefix = findCommonPrefix(prefix, currentString)
    if (prefix === '') return ''
  }
  return prefix
}

/**
 * Creates a file suggestion item
 */
function createFileSuggestionItem(
  filePath: string,
  score?: number,
): SuggestionItem {
  return {
    id: `file-${filePath}`,
    displayText: filePath,
    metadata: score !== undefined ? { score } : undefined,
  }
}

/**
 * Find matching files and folders for a given query using the TS file index
 */
const MAX_SUGGESTIONS = 15
function findMatchingFiles(
  fileIndex: FileIndex,
  partialPath: string,
): SuggestionItem[] {
  const results = fileIndex.search(partialPath, MAX_SUGGESTIONS)
  return results.map(result =>
    createFileSuggestionItem(result.path, result.score),
  )
}

/**
 * Starts a background refresh of the file index cache if not already in progress.
 *
 * Throttled: when a cache already exists, we skip the refresh unless git state
 * has actually changed. This prevents every keystroke from spawning git ls-files
 * and rebuilding the nucleo index.
 */
const REFRESH_THROTTLE_MS = 5_000
export function startBackgroundCacheRefresh(): void {
  if (_fileListRefreshPromise()) return

  const indexMtime = getGitIndexMtime()
  if (_fileIndex()) {
    const gitStateChanged =
      indexMtime !== null && indexMtime !== _lastGitIndexMtime()
    if (!gitStateChanged && Date.now() - _lastRefreshMs() < REFRESH_THROTTLE_MS) {
      return
    }
  }

  const generation = _cacheGeneration()
  const refreshStart = Date.now()
  getFileIndex()
  _setFileListRefreshPromise(getPathsForSuggestions()
    .then(result => {
      if (generation !== _cacheGeneration()) {
        return result
      }
      _setFileListRefreshPromise(null)
      indexBuildComplete.emit()
      _setLastGitIndexMtime(indexMtime)
      _setLastRefreshMs(Date.now())
      logForDebugging(
        `[FileIndex] cache refresh completed in ${Date.now() - refreshStart}ms`,
      )
      return result
    })
    .catch(error => {
      logForDebugging(
        `[FileIndex] Cache refresh failed: ${errorMessage(error)}`,
      )
      logError(error)
      if (generation === _cacheGeneration()) {
        _setFileListRefreshPromise(null)
      }
      return getFileIndex()
    }))
}

/**
 * Gets the top-level files and directories in the current working directory
 * @returns Array of file/directory paths in the current directory
 */
async function getTopLevelPaths(): Promise<string[]> {
  const fs = getFsImplementation()
  const cwd = getCwd()

  try {
    const entries = await fs.readdir(cwd)
    return entries.map(entry => {
      const fullPath = path.join(cwd, entry.name)
      const relativePath = path.relative(cwd, fullPath)
      // Add trailing separator for directories
      return entry.isDirectory() ? relativePath + path.sep : relativePath
    })
  } catch (error) {
    logError(error as Error)
    return []
  }
}

/**
 * Generate file suggestions for the current input and cursor position
 * @param partialPath The partial file path to match
 * @param showOnEmpty Whether to show suggestions even if partialPath is empty (used for @ symbol)
 */
export async function generateFileSuggestions(
  partialPath: string,
  showOnEmpty = false,
): Promise<SuggestionItem[]> {
  // If input is empty and we don't want to show suggestions on empty, return nothing
  if (!partialPath && !showOnEmpty) {
    return []
  }

  // Use custom command directly if configured. We don't mix in our config files
  // because the command returns pre-ranked results using its own search logic.
  if (getInitialSettings().fileSuggestion?.type === 'command') {
    const input: FileSuggestionCommandInput = {
      ...createBaseHookInput(),
      query: partialPath,
    }
    const results = await executeFileSuggestionCommand(input)
    return results.slice(0, MAX_SUGGESTIONS).map(createFileSuggestionItem)
  }

  // If the partial path is empty or just a dot, return current directory suggestions
  if (partialPath === '' || partialPath === '.' || partialPath === './') {
    const topLevelPaths = await getTopLevelPaths()
    startBackgroundCacheRefresh()
    return topLevelPaths.slice(0, MAX_SUGGESTIONS).map(createFileSuggestionItem)
  }

  const startTime = Date.now()

  try {
    // Kick a background refresh. The index is progressively queryable —
    // searches during build return partial results from ready chunks, and
    // the typeahead callback (setOnIndexBuildComplete) re-fires the search
    // when the build finishes to upgrade partial → full.
    const wasBuilding = _fileListRefreshPromise() !== null
    startBackgroundCacheRefresh()

    // Handle both './' and '.\'
    let normalizedPath = partialPath
    const currentDirPrefix = '.' + path.sep
    if (partialPath.startsWith(currentDirPrefix)) {
      normalizedPath = partialPath.substring(2)
    }

    // Handle tilde expansion for home directory
    if (normalizedPath.startsWith('~')) {
      normalizedPath = expandPath(normalizedPath)
    }

    const matches = _fileIndex()
      ? findMatchingFiles(_fileIndex()!, normalizedPath)
      : []

    const duration = Date.now() - startTime
    logForDebugging(
      `[FileIndex] generateFileSuggestions: ${matches.length} results in ${duration}ms (${wasBuilding ? 'partial' : 'full'} index)`,
    )
    logEvent('tengu_file_suggestions_query', {
      duration_ms: duration,
      cache_hit: !wasBuilding,
      result_count: matches.length,
      query_length: partialPath.length,
    })

    return matches
  } catch (error) {
    logError(error)
    return []
  }
}

/**
 * Apply a file suggestion to the input
 */
export function applyFileSuggestion(
  suggestion: string | SuggestionItem,
  input: string,
  partialPath: string,
  startPos: number,
  onInputChange: (value: string) => void,
  setCursorOffset: (offset: number) => void,
): void {
  // Extract suggestion text from string or SuggestionItem
  const suggestionText =
    typeof suggestion === 'string' ? suggestion : suggestion.displayText

  // Replace the partial path with the selected file path
  const newInput =
    input.substring(0, startPos) +
    suggestionText +
    input.substring(startPos + partialPath.length)
  onInputChange(newInput)

  // Move cursor to end of the file path
  const newCursorPos = startPos + suggestionText.length
  setCursorOffset(newCursorPos)
}
