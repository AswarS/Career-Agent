import type { BaseProfileRecord, ProfileMemoryRecord } from './profile-v2.types';

function escapeComment(value: string) {
  return value.replace(/-->/g, '--&gt;');
}

function renderItem(item: ProfileMemoryRecord) {
  const metadata = [
    `id=${item.id}`,
    `category=${item.category}`,
    `slot=${item.slotKey || '-'}`,
    `priority=${item.priority}`,
    `status=${item.status}`,
    item.expiresAt ? `expires_at=${item.expiresAt}` : null,
  ].filter(Boolean).join(' ');
  const content = item.status === 'deleted'
    ? `[已删除] 条目 ${item.id}`
    : item.content;
  return `<!-- profile:item ${escapeComment(metadata)} -->\n- ${content}`;
}

export function renderProfileMarkdown(input: {
  baseProfile: BaseProfileRecord;
  memories: ProfileMemoryRecord[];
  version: number;
  generatedAt: string;
}) {
  const activeLong = input.memories.filter(
    (item) => item.status === 'active' && item.timeScope === 'long_term',
  );
  const activeShort = input.memories.filter(
    (item) => item.status === 'active' && item.timeScope === 'short_term',
  );
  const inactive = input.memories.filter((item) => item.status !== 'active');
  const section = (title: string, items: ProfileMemoryRecord[]) => [
    `## ${title}`,
    '',
    items.length ? items.map(renderItem).join('\n\n') : '- 暂无',
  ].join('\n');

  return [
    '# Profile Memory',
    '',
    `> version: ${input.version}`,
    `> generated_at: ${input.generatedAt}`,
    `> owner: ${input.baseProfile.name || `user-${input.baseProfile.userId}`}`,
    '',
    section('长期 Profile', activeLong),
    '',
    section('短期 Profile', activeShort),
    '',
    '## 历史信息',
    '',
    '> 本节条目禁止作为当前事实使用。',
    '',
    inactive.length ? inactive.map(renderItem).join('\n\n') : '- 暂无',
    '',
  ].join('\n');
}

export function renderMemoryIndex(input: {
  memories: ProfileMemoryRecord[];
  version: number;
}) {
  const important = input.memories
    .filter((item) =>
      item.status === 'active'
      && (item.priority === 'hard_constraint' || item.priority === 'high'))
    .slice(0, 50);
  return [
    '# Career Agent Profile Memory',
    '',
    `> profile_version: ${input.version}`,
    '> `profile.md` 是完整 Profile；本文件只包含当前最重要的约束和目标。',
    '',
    ...important.map((item) =>
      `- [${item.priority}] ${item.content.length > 180 ? `${item.content.slice(0, 177)}...` : item.content}（详见 [profile.md](profile.md#${item.timeScope === 'long_term' ? '长期-profile' : '短期-profile'})）`),
    ...(important.length ? [] : ['- 暂无高优先级条目。']),
    '',
  ].join('\n');
}
