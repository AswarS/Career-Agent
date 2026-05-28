import { join } from 'node:path';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../../../utils/frontmatterParser.js';
import {
  parseSkillFrontmatterFields,
  type LoadedFrom,
} from '../../../skills/loadSkillsDir.js';
import { parseArgumentNames } from '../../../utils/argumentSubstitution.js';

const networkRootDir = fileURLToPath(new URL('../../', import.meta.url));
const userDataRootDir = join(networkRootDir, 'user');

export interface ParsedSkillFile {
  name: string;
  filePath: string;
  description: string;
  category: string;
  content: string;
  argumentNames: string[];
  userInvocable: boolean;
  loadedFrom: LoadedFrom;
}

function skillsDir(userId: number): string {
  return join(userDataRootDir, String(userId), 'skills');
}

function skillDir(userId: number, name: string): string {
  return join(skillsDir(userId), name);
}

function skillFilePath(userId: number, name: string): string {
  return join(skillDir(userId, name), 'SKILL.md');
}

export function getSkillPath(userId: number, name: string): string {
  return skillFilePath(userId, name);
}

export async function listUserSkills(userId: number): Promise<ParsedSkillFile[]> {
  const dir = skillsDir(userId);
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: ParsedSkillFile[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const path = join(dir, entry.name, 'SKILL.md');
    try {
      const parsed = await parseSkillFile(path);
      if (parsed) results.push(parsed);
    } catch {
      // skip malformed
    }
  }
  return results;
}

export async function readSkillFile(
  userId: number,
  name: string,
): Promise<ParsedSkillFile | null> {
  const path = skillFilePath(userId, name);
  return parseSkillFile(path);
}

async function parseSkillFile(filePath: string): Promise<ParsedSkillFile | null> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }

  const { frontmatter, content: markdownContent } = parseFrontmatter(
    content,
    filePath,
  );

  const skillName =
    filePath.split(/[/\\]/).slice(-2, -1)[0] ?? 'unknown';
  const parsed = parseSkillFrontmatterFields(
    frontmatter,
    markdownContent,
    skillName,
  );

  const category =
    typeof frontmatter.category === 'string'
      ? frontmatter.category
      : 'utility';

  return {
    name: skillName,
    filePath,
    description: parsed.description,
    category,
    content: markdownContent,
    argumentNames: parsed.argumentNames,
    userInvocable: parsed.userInvocable,
    loadedFrom: 'skills',
  };
}

export async function writeSkillFile(
  userId: number,
  name: string,
  frontmatter: Record<string, unknown>,
  content: string,
): Promise<string> {
  const dir = skillDir(userId, name);
  await mkdir(dir, { recursive: true });

  const fmLines = Object.entries(frontmatter)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      if (typeof v === 'string' && /[:#\n{}[\],&*?|>!%@`"]/.test(v)) {
        return `${k}: "${v.replace(/"/g, '\\"')}"`;
      }
      return `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`;
    });

  const md = `---\n${fmLines.join('\n')}\n---\n\n${content}\n`;
  const path = skillFilePath(userId, name);
  await writeFile(path, md, 'utf-8');
  return path;
}

export async function deleteSkillFile(
  userId: number,
  name: string,
): Promise<boolean> {
  const dir = skillDir(userId, name);
  try {
    await rm(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}