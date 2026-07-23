import { basename, dirname, extname, join, relative, resolve } from 'path'
import { isENOENT } from '../utils/errors.js'
import { writeTextContent } from '../utils/file.js'
import { parseFrontmatter } from '../utils/frontmatterParser.js'
import { getFsImplementation } from '../utils/fsOperations.js'
import {
  getAutoMemPath,
  isAutoMemPath,
  isNativeLoopAutoMemory,
} from './paths.js'

export const NATIVE_MEMORY_INDEX_START =
  '<!-- career-agent-native-memory:start -->'
export const NATIVE_MEMORY_INDEX_END = '<!-- career-agent-native-memory:end -->'

const PROTECTED_ROOT_FILES = new Set(['memory.md', 'profile-v2.md'])
const EXCLUDED_ROOT_DIRECTORIES = new Set(['logs', 'team'])

export type AutoMemoryIndexTopic = {
  relativePath: string
  title: string
  description: string | null
}

function relativeAutoMemoryPath(filePath: string): string | null {
  if (!isAutoMemPath(filePath)) return null
  const value = relative(resolve(getAutoMemPath()), resolve(filePath))
  if (
    !value ||
    value === '..' ||
    value.startsWith('../') ||
    value.startsWith('..\\')
  ) {
    return null
  }
  return value.replaceAll('\\', '/')
}

export function isProtectedNativeAutoMemoryPath(filePath: string): boolean {
  if (!isNativeLoopAutoMemory()) return false
  const relativePath = relativeAutoMemoryPath(filePath)
  return (
    relativePath !== null &&
    !relativePath.includes('/') &&
    PROTECTED_ROOT_FILES.has(relativePath.toLowerCase())
  )
}

export function isNativeAutoMemoryTopicPath(filePath: string): boolean {
  if (!isNativeLoopAutoMemory()) return false
  const relativePath = relativeAutoMemoryPath(filePath)
  if (!relativePath || extname(relativePath).toLowerCase() !== '.md') {
    return false
  }
  const [rootDirectory] = relativePath.toLowerCase().split('/')
  return (
    !PROTECTED_ROOT_FILES.has(relativePath.toLowerCase()) &&
    !EXCLUDED_ROOT_DIRECTORIES.has(rootDirectory ?? '')
  )
}

export function getNativeAutoMemoryToolPathError(
  filePath: string,
): string | null {
  if (!isProtectedNativeAutoMemoryPath(filePath)) return null
  return (
    `The file ${basename(filePath)} is managed by Career-Agent and cannot be ` +
    'edited with agent file tools. Edit a topic .md file instead; the managed index is rebuilt automatically.'
  )
}

function toSingleLine(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized || null
}

function escapeLinkTitle(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeLinkTarget(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/')
}

function shortenDescription(value: string | null): string | null {
  if (!value) return null
  const safe = value.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  if (safe.length <= 150) return safe
  return `${safe.slice(0, 147).trimEnd()}...`
}

export function buildNativeAutoMemoryIndexBlock(
  topics: readonly AutoMemoryIndexTopic[],
): string {
  const lines = [
    NATIVE_MEMORY_INDEX_START,
    '## Auto-memory topics',
    '',
  ]

  if (topics.length === 0) {
    lines.push('_No active topic memories._')
  } else {
    for (const topic of topics) {
      const description = shortenDescription(topic.description)
      lines.push(
        `- [${escapeLinkTitle(topic.title)}](<${escapeLinkTarget(topic.relativePath)}>)${
          description ? ` — ${description}` : ''
        }`,
      )
    }
  }

  lines.push('', NATIVE_MEMORY_INDEX_END)
  return lines.join('\n')
}

export function replaceNativeAutoMemoryIndexBlock(
  currentContent: string,
  managedBlock: string,
): string {
  const start = currentContent.indexOf(NATIVE_MEMORY_INDEX_START)
  const end =
    start >= 0
      ? currentContent.indexOf(NATIVE_MEMORY_INDEX_END, start)
      : -1

  if (
    (start >= 0 && end < 0) ||
    (start < 0 && currentContent.includes(NATIVE_MEMORY_INDEX_END))
  ) {
    throw new Error(
      'MEMORY.md contains an incomplete Career-Agent managed index block',
    )
  }

  if (start >= 0 && end >= start) {
    const before = currentContent.slice(0, start).trimEnd()
    const after = currentContent
      .slice(end + NATIVE_MEMORY_INDEX_END.length)
      .trimStart()
    return [before, managedBlock, after].filter(Boolean).join('\n\n') + '\n'
  }

  const existing = currentContent.trim()
  return `${existing ? `${existing}\n\n` : ''}${managedBlock}\n`
}

function scanTopicFiles(memoryDir: string): AutoMemoryIndexTopic[] {
  const fs = getFsImplementation()
  const topics: AutoMemoryIndexTopic[] = []

  function visit(directory: string, relativeDirectory = ''): void {
    let entries
    try {
      entries = fs.readdirSync(directory)
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name
      const absolutePath = join(directory, entry.name)

      if (entry.isDirectory()) {
        if (
          !relativeDirectory &&
          EXCLUDED_ROOT_DIRECTORIES.has(entry.name.toLowerCase())
        ) {
          continue
        }
        visit(absolutePath, relativePath)
        continue
      }

      if (
        !entry.isFile() ||
        extname(entry.name).toLowerCase() !== '.md' ||
        PROTECTED_ROOT_FILES.has(relativePath.toLowerCase())
      ) {
        continue
      }

      let content: string
      try {
        content = fs.readFileSync(absolutePath, { encoding: 'utf8' })
      } catch {
        continue
      }
      const { frontmatter } = parseFrontmatter(content, absolutePath)
      if (
        typeof frontmatter.status === 'string' &&
        frontmatter.status.trim().toLowerCase() === 'deleted'
      ) {
        continue
      }

      topics.push({
        relativePath: relativePath.replaceAll('\\', '/'),
        title:
          toSingleLine(frontmatter.name) ?? basename(entry.name, extname(entry.name)),
        description: toSingleLine(frontmatter.description),
      })
    }
  }

  visit(memoryDir)
  return topics.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

/** Rebuild only the managed block; all content outside the markers is kept. */
export function rebuildNativeAutoMemoryIndex(
  memoryDir = getAutoMemPath(),
): void {
  const fs = getFsImplementation()
  const entrypoint = join(memoryDir, 'MEMORY.md')
  let currentContent = ''
  try {
    currentContent = fs.readFileSync(entrypoint, { encoding: 'utf8' })
  } catch (error) {
    if (!isENOENT(error)) throw error
  }

  const managedBlock = buildNativeAutoMemoryIndexBlock(
    scanTopicFiles(memoryDir),
  )
  const nextContent = replaceNativeAutoMemoryIndexBlock(
    currentContent,
    managedBlock,
  )
  if (nextContent !== currentContent) {
    writeTextContent(entrypoint, nextContent, 'utf8', 'LF')
  }
}
