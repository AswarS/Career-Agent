import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GeneratedFile } from './agent.runtime.js';
import { readActionArtifactManifest } from '../../../artifacts/actionArtifactPublisher.js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.aiff', '.opus']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv']);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);

const GENERATED_DIRECTORIES: Array<{
  subdir: string;
  kind: GeneratedFile['kind'];
}> = [
  { subdir: 'image_generated', kind: 'image' },
  { subdir: 'audio_generated', kind: 'audio' },
  { subdir: 'video_generated', kind: 'video' },
  { subdir: 'html_generated', kind: 'html' },
  { subdir: 'app_generated', kind: 'app' },
];

export async function discoverGeneratedFiles(
  workspaceDir: string,
  sinceMs: number,
): Promise<GeneratedFile[]> {
  const results: GeneratedFile[] = [];

  for (const { subdir, kind } of GENERATED_DIRECTORIES) {
    const dir = join(workspaceDir, subdir);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }

    for (const name of entries) {
      if (name.endsWith('.log')) continue;
      const filePath = join(dir, name);
      try {
        const fileStats = await stat(filePath);
        if (fileStats.mtimeMs < sinceMs || !matchesGeneratedKind(name, kind, fileStats.isDirectory())) {
          continue;
        }

        const actionArtifact = kind === 'html'
          ? await readActionArtifactManifest(filePath, workspaceDir)
          : undefined;
        results.push({
          path: filePath,
          kind,
          title: actionArtifact?.title ?? name,
          sizeBytes: fileStats.isFile() ? fileStats.size : undefined,
          ...(actionArtifact ? { actionArtifact } : {}),
        });
      } catch {
        continue;
      }
    }
  }

  await stageStandaloneWorkspaceFiles(workspaceDir, sinceMs, results);
  return results;
}

async function stageStandaloneWorkspaceFiles(
  workspaceDir: string,
  sinceMs: number,
  results: GeneratedFile[],
) {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(workspaceDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const kind = detectStandaloneGeneratedKind(entry.name);
    if (!kind) {
      continue;
    }

    const sourcePath = join(workspaceDir, entry.name);
    try {
      const sourceStats = await stat(sourcePath);
      if (sourceStats.mtimeMs < sinceMs) {
        continue;
      }

      const generatedDir = join(workspaceDir, `${kind}_generated`);
      await mkdir(generatedDir, { recursive: true });
      const stagedPath = join(generatedDir, createStagedFileName(entry.name));
      await copyFile(sourcePath, stagedPath);

      results.push({
        path: stagedPath,
        kind,
        title: entry.name,
        sizeBytes: sourceStats.size,
      });
    } catch {
      continue;
    }
  }
}

function matchesGeneratedKind(
  fileName: string,
  kind: GeneratedFile['kind'],
  isDirectory: boolean,
) {
  if (kind === 'app') {
    return isDirectory;
  }
  if (isDirectory) {
    return false;
  }

  const extension = extname(fileName).toLowerCase();
  if (kind === 'image') return IMAGE_EXTENSIONS.has(extension);
  if (kind === 'audio') return AUDIO_EXTENSIONS.has(extension);
  if (kind === 'video') return VIDEO_EXTENSIONS.has(extension);
  if (kind === 'html') return HTML_EXTENSIONS.has(extension);
  return false;
}

function detectStandaloneGeneratedKind(
  fileName: string,
): Exclude<GeneratedFile['kind'], 'app' | 'file'> | undefined {
  const extension = extname(fileName).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (HTML_EXTENSIONS.has(extension)) return 'html';
  return undefined;
}

function createStagedFileName(originalName: string) {
  const safeName = basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  return `${Date.now()}-${suffix}-${safeName || 'generated-file'}`;
}
