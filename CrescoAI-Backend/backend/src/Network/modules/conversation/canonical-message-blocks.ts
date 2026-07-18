export const THINKING_BLOCK_TITLE = '思考'
export const SKILL_BLOCK_TITLE = 'Skill'

export interface CanonicalMessageBlock {
  id: string
  type: 'text' | 'status' | 'tool_call' | 'tool_result' | 'skill' | 'artifact' | 'ask_question'
  text?: string
  title?: string
  name?: string | null
  status?: string | null
  toolUseId?: string | null
  answers?: Record<string, string>
}

export function extractLoadedSkillNameFromText(value: string | null | undefined): string | null {
  const text = value ?? ''
  const directMatch = text.match(
    /(?:Skill command selected:\s*\/|Launching skill:\s*)([A-Za-z0-9_.-]+)/i,
  ) ?? text.match(/\bSkill\s+([A-Za-z0-9_.-]+)\s+loaded\b/i)
  if (directMatch?.[1]) return directMatch[1].replace(/\.+$/, '')

  const baseDirectoryMatch = text.match(/Base directory for this skill:\s*([^\r\n]+)/i)
  if (!baseDirectoryMatch?.[1]) return null
  return baseDirectoryMatch[1]
    .trim()
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() ?? null
}

export function createSkillLoadedBlock<T extends CanonicalMessageBlock>(skillName: string): T {
  return {
    id: `skill-loaded-${skillName}`,
    type: 'status',
    title: SKILL_BLOCK_TITLE,
    name: skillName,
    status: 'completed',
    text: `Skill ${skillName} loaded`,
  } as T
}

function isInternalSkillBlock(block: CanonicalMessageBlock): boolean {
  if (block.type === 'skill') return true
  if (block.name?.trim().toLowerCase() === 'skill') return true
  return /Skill command selected:|Launching skill:|Base directory for this skill:/i.test(
    [block.title, block.text].filter(Boolean).join('\n'),
  )
}

function isSkillLoadedNotice(block: CanonicalMessageBlock): boolean {
  return /^Skill\s+[A-Za-z0-9_.-]+\s+loaded$/i.test(block.text?.trim() ?? '')
}

function normalizeStatusTitle(title: string | undefined): string {
  const normalized = title?.trim()
  if (!normalized || normalized === '过程' || /^process$/i.test(normalized)) {
    return THINKING_BLOCK_TITLE
  }
  return normalized
}

export function normalizeCanonicalMessageBlocks<T extends CanonicalMessageBlock>(
  blocks: readonly T[] | null | undefined,
  options: { authoritativeText?: string | null } = {},
): T[] | undefined {
  const orderedBlocks: T[] = []
  const orderedBlockIndexes = new Map<string, number>()
  const artifactBlocks: T[] = []
  const artifactIndexes = new Map<string, number>()
  const textBlockIndexes: number[] = []
  let textIndex = 0
  let statusIndex = 0

  const upsert = (target: T[], indexes: Map<string, number>, block: T) => {
    const existingIndex = indexes.get(block.id)
    if (existingIndex === undefined) {
      indexes.set(block.id, target.length)
      target.push(block)
      return
    }
    target[existingIndex] = block
  }

  for (const sourceBlock of blocks ?? []) {
    if (sourceBlock.type === 'text') {
      const text = sourceBlock.text?.trim()
      if (!text) continue
      textBlockIndexes.push(orderedBlocks.length)
      orderedBlocks.push({
        ...sourceBlock,
        id: `text-${textIndex++}`,
        text,
      } as T)
      continue
    }

    if (isInternalSkillBlock(sourceBlock) || isSkillLoadedNotice(sourceBlock)) {
      const skillName = sourceBlock.type === 'skill' && sourceBlock.name?.trim()
        ? sourceBlock.name.trim()
        : extractLoadedSkillNameFromText(
            [sourceBlock.title, sourceBlock.text].filter(Boolean).join('\n'),
          )
      if (skillName && skillName.toLowerCase() !== 'skill') {
        upsert(orderedBlocks, orderedBlockIndexes, createSkillLoadedBlock<T>(skillName))
      }
      continue
    }

    if (sourceBlock.type === 'artifact') {
      upsert(artifactBlocks, artifactIndexes, sourceBlock)
      continue
    }

    const normalizedBlock = sourceBlock.type === 'status'
      ? {
          ...sourceBlock,
          id: `status-${statusIndex++}`,
          title: normalizeStatusTitle(sourceBlock.title),
        } as T
      : sourceBlock
    upsert(orderedBlocks, orderedBlockIndexes, normalizedBlock)
  }

  const authoritativeText = options.authoritativeText !== undefined
    ? options.authoritativeText?.trim() ?? ''
    : ''
  if (authoritativeText) {
    const finalTextBlockIndex = textBlockIndexes[textBlockIndexes.length - 1]
    if (finalTextBlockIndex === undefined) {
      orderedBlocks.push({ id: 'text-0', type: 'text', text: authoritativeText } as T)
    } else if (orderedBlocks[finalTextBlockIndex]?.text?.trim() !== authoritativeText) {
      orderedBlocks[finalTextBlockIndex] = {
        ...orderedBlocks[finalTextBlockIndex],
        text: authoritativeText,
      }
    }
  }

  const output = [...orderedBlocks, ...artifactBlocks]
  return output.length ? output : undefined
}
