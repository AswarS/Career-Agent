import type { MessageBlock } from '../../types/entities';

export const THINKING_BLOCK_TITLE = '思考';
export const SKILL_BLOCK_TITLE = 'Skill';

export function extractSkillName(value: string | null | undefined): string | null {
  const text = value ?? '';
  const directMatch = text.match(
    /(?:Skill command selected:\s*\/|Launching skill:\s*)([A-Za-z0-9_.-]+)/i,
  ) ?? text.match(/\bSkill\s+([A-Za-z0-9_.-]+)\s+loaded\b/i);
  if (directMatch?.[1]) return directMatch[1];

  const baseDirectoryMatch = text.match(/Base directory for this skill:\s*([^\r\n]+)/i);
  if (!baseDirectoryMatch?.[1]) return null;
  return baseDirectoryMatch[1]
    .trim()
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() ?? null;
}

export function extractSkillNameFromBlock(block: MessageBlock | undefined): string | null {
  if (!block) return null;
  const explicitName = block.name?.trim();
  if (block.type === 'skill' && explicitName && explicitName.toLowerCase() !== 'skill') {
    return explicitName;
  }
  return extractSkillName([block.title, block.text].filter(Boolean).join('\n'));
}

export function isInternalSkillBlock(block: MessageBlock | undefined): boolean {
  if (!block) return false;
  if (block.type === 'skill') return true;
  if (block.name?.trim().toLowerCase() === 'skill') return true;
  return /Skill command selected:|Launching skill:|Base directory for this skill:/i.test(
    [block.title, block.text].filter(Boolean).join('\n'),
  );
}

export function createSkillLoadedBlock(skillName: string): MessageBlock {
  return {
    id: `skill-loaded-${skillName}`,
    type: 'status',
    title: SKILL_BLOCK_TITLE,
    name: skillName,
    status: 'completed',
    text: `Skill ${skillName} loaded`,
  };
}

function isSkillLoadedNotice(block: MessageBlock): boolean {
  return /^Skill\s+[A-Za-z0-9_.-]+\s+loaded$/i.test(block.text?.trim() ?? '');
}

function normalizeStatusTitle(title: string | undefined): string {
  const normalized = title?.trim();
  if (!normalized || normalized === '过程' || /^process$/i.test(normalized)) {
    return THINKING_BLOCK_TITLE;
  }
  return normalized;
}

export function normalizeMessageBlocks(
  blocks: MessageBlock[] | null | undefined,
  options: { authoritativeText?: string | null } = {},
): MessageBlock[] | undefined {
  const orderedIds: string[] = [];
  const normalizedById = new Map<string, MessageBlock>();
  const textParts: string[] = [];
  let statusIndex = 0;
  const upsert = (block: MessageBlock) => {
    if (!normalizedById.has(block.id)) orderedIds.push(block.id);
    normalizedById.set(block.id, block);
  };

  for (const sourceBlock of blocks ?? []) {
    if (sourceBlock.type === 'text') {
      if (sourceBlock.text) textParts.push(sourceBlock.text);
      continue;
    }

    if (isInternalSkillBlock(sourceBlock) || isSkillLoadedNotice(sourceBlock)) {
      const skillName = extractSkillNameFromBlock(sourceBlock)
        ?? extractSkillName(sourceBlock.text);
      if (skillName) upsert(createSkillLoadedBlock(skillName));
      continue;
    }

    upsert(sourceBlock.type === 'status'
      ? {
          ...sourceBlock,
          id: `status-${statusIndex++}`,
          title: normalizeStatusTitle(sourceBlock.title),
        }
      : sourceBlock);
  }

  const authoritativeText = options.authoritativeText !== undefined
    ? options.authoritativeText?.trim() ?? ''
    : textParts.join('\n').trim();
  if (authoritativeText) {
    upsert({ id: 'text-0', type: 'text', text: authoritativeText });
  }

  const normalized = orderedIds
    .map((id) => normalizedById.get(id))
    .filter((block): block is MessageBlock => Boolean(block));
  const textBlock = normalized.find((block) => block.type === 'text');
  const executionBlocks = normalized.filter(
    (block) => block.type !== 'text' && block.type !== 'artifact',
  );
  const artifactBlocks = normalized.filter((block) => block.type === 'artifact');
  const output = [
    ...executionBlocks,
    ...(textBlock ? [textBlock] : []),
    ...artifactBlocks,
  ];
  return output.length ? output : undefined;
}
