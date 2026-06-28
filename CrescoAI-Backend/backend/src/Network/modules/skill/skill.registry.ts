import { Injectable } from '@nestjs/common';

export type SkillStatus = 'loaded' | 'unloaded' | 'error';
export type SkillSource = 'builtin' | 'custom';

export interface SkillParameter {
  name: string;
  description: string;
  required?: boolean;
  default?: string;
}

export interface SkillHandlerResult {
  success: boolean;
  reply: string;
  metadata?: Record<string, unknown>;
  artifacts?: Array<{
    type: 'text' | 'image' | 'link';
    content: string;
    title?: string;
  }>;
  outputFiles?: Array<{
    path?: string;
    url?: string;
    kind?: 'image' | 'audio' | 'video' | 'html' | 'app' | 'file';
    title?: string;
    mimeType?: string;
    sizeBytes?: number;
  }>;
}

export interface SkillProgressEvent {
  type: 'reasoning.delta' | 'reply.delta';
  delta: string;
}

export interface SkillExecutionContext {
  userId?: number;
  conversationId?: string;
  abortSignal?: AbortSignal;
  onProgress?: (event: SkillProgressEvent) => void;
  llmConfig?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
  runUnifiedPrompt?: (input: {
    content: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    userId?: number;
    conversationId?: string;
  }) => Promise<{
    success: boolean;
    reply?: string;
    thinking?: string;
    model?: string;
    generatedFiles?: SkillHandlerResult['outputFiles'];
  }>;
  runInSession?: <T>(
    callback: (context: { abortController: AbortController }) => Promise<T>,
  ) => Promise<T>;
  [key: string]: unknown;
}

export type SkillHandler = (
  args: string,
  context?: SkillExecutionContext,
) => Promise<SkillHandlerResult>;

export interface SkillEntry {
  name: string;
  description: string;
  category: 'search' | 'analysis' | 'generation' | 'utility';
  status: SkillStatus;
  source: SkillSource;
  handler: SkillHandler;
  parameters: SkillParameter[];
  requiresLlm?: boolean;
  version?: string;
  userId?: number;
  argumentNames?: string[];
  filePath?: string;
}

@Injectable()
export class SkillRegistry {
  private readonly skills = new Map<string, SkillEntry>();

  register(entry: Omit<SkillEntry, 'status'>): void {
    const key = this.builtinKey(entry.name);
    this.skills.set(key, {
      ...entry,
      source: 'builtin',
      status: 'loaded',
      name: this.normalizeName(entry.name),
    });
  }

  registerCustom(
    userId: number,
    entry: Omit<SkillEntry, 'status' | 'source' | 'userId'>,
  ): void {
    const normalizedName = this.normalizeName(entry.name);
    this.skills.set(this.customKey(userId, normalizedName), {
      ...entry,
      name: normalizedName,
      source: 'custom',
      userId,
      status: 'loaded',
    });
  }

  unregister(name: string): boolean {
    return this.skills.delete(this.builtinKey(name));
  }

  unregisterCustom(userId: number, name: string): boolean {
    return this.skills.delete(this.customKey(userId, name));
  }

  get(name: string, userId?: number): SkillEntry | undefined {
    if (userId !== undefined) {
      const custom = this.skills.get(this.customKey(userId, name));
      if (custom) {
        return custom;
      }
    }
    return this.skills.get(this.builtinKey(name));
  }

  has(name: string, userId?: number): boolean {
    return this.get(name, userId) !== undefined;
  }

  getAll(userId?: number): SkillEntry[] {
    const builtin = Array.from(this.skills.values()).filter(
      (entry) => entry.source === 'builtin',
    );
    if (userId === undefined) {
      return builtin;
    }

    const custom = Array.from(this.skills.values()).filter(
      (entry) => entry.source === 'custom' && entry.userId === userId,
    );
    return [...builtin, ...custom];
  }

  getByCategory(category: SkillEntry['category'], userId?: number): SkillEntry[] {
    return this.getAll(userId).filter((s) => s.category === category);
  }

  getCustomForUser(userId: number): SkillEntry[] {
    return Array.from(this.skills.values()).filter(
      (entry) => entry.source === 'custom' && entry.userId === userId,
    );
  }

  setStatus(name: string, status: SkillStatus, userId?: number): boolean {
    const key =
      userId === undefined ? this.builtinKey(name) : this.customKey(userId, name);
    const existing = this.skills.get(key);
    if (!existing) {
      return false;
    }
    this.skills.set(key, { ...existing, status });
    return true;
  }

  clear(): void {
    this.skills.clear();
  }

  clearCustomForUser(userId: number): void {
    for (const entry of this.getCustomForUser(userId)) {
      this.skills.delete(this.customKey(userId, entry.name));
    }
  }

  private normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/[\s_]+/g, '-');
  }

  private builtinKey(name: string): string {
    return `builtin:${this.normalizeName(name)}`;
  }

  private customKey(userId: number, name: string): string {
    return `user:${userId}:${this.normalizeName(name)}`;
  }
}
