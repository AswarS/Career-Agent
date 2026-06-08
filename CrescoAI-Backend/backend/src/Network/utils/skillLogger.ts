/**
 * File-based logger for skill execution.
 * Writes logs to daily-rotated files under Network/logs/skill/YYYY-MM-DD.log
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const LOGS_ROOT = join(__dir, '..', 'logs', 'skill');

let ensuredDir = false;

function getDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTimestamp(): string {
  return new Date().toISOString();
}

async function ensureLogDir(): Promise<void> {
  if (ensuredDir) return;
  await mkdir(LOGS_ROOT, { recursive: true });
  ensuredDir = true;
}

async function writeLine(level: string, tag: string, message: string, data?: any): Promise<void> {
  try {
    await ensureLogDir();
    const logFile = join(LOGS_ROOT, `${getDateStr()}.log`);
    const entry = data !== undefined
      ? `[${getTimestamp()}] [${level}] [${tag}] ${message} ${JSON.stringify(data)}\n`
      : `[${getTimestamp()}] [${level}] [${tag}] ${message}\n`;
    await appendFile(logFile, entry, 'utf-8');
  } catch {
    // Fallback to console if file write fails
    console.error(`[skillLogger] Failed to write log: [${tag}] ${message}`);
  }
}

export const skillLogger = {
  info(tag: string, message: string, data?: any): void {
    void writeLine('INFO', tag, message, data);
    console.log(`[${tag}] ${message}`, data !== undefined ? data : '');
  },
  warn(tag: string, message: string, data?: any): void {
    void writeLine('WARN', tag, message, data);
    console.warn(`[${tag}] ${message}`, data !== undefined ? data : '');
  },
  error(tag: string, message: string, data?: any): void {
    void writeLine('ERROR', tag, message, data);
    console.error(`[${tag}] ${message}`, data !== undefined ? data : '');
  },
};
