import { existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

export type OutputKind = 'image' | 'audio' | 'video' | 'html' | 'app' | 'file';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.tiff', '.avif']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.aiff', '.opus']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v']);
const HTML_EXTS  = new Set(['.html', '.htm']);

export function detectOutputType(filePath: string): OutputKind {
  try {
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      const hasPackageJson = existsSync(join(filePath, 'package.json'));
      const hasIndexHtml   =
        existsSync(join(filePath, 'index.html')) ||
        existsSync(join(filePath, 'dist', 'index.html'));
      if (hasPackageJson || hasIndexHtml) return 'app';
      return 'file';
    }
  } catch {
    // non-existent or inaccessible path — fall through to extension check
  }

  const ext = extname(filePath).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (HTML_EXTS.has(ext))  return 'html';
  return 'file';
}
