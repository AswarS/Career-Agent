import { Injectable } from '@nestjs/common';

export type SkillStatus = 'loaded' | 'unloaded' | 'error';

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
    path: string;
    kind?: 'image' | 'video' | 'html' | 'app' | 'file';
    title?: string;
  }>;
}

export interface SkillExecutionContext {
  userId?: number;
  conversationId?: string;
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
  }) => Promise<{ success: boolean; reply?: string; thinking?: string; model?: string }>;
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
  handler: SkillHandler;
  parameters: SkillParameter[];
  requiresLlm?: boolean;
  version?: string;
}

@Injectable()
export class SkillRegistry {
  private readonly skills = new Map<string, SkillEntry>();

  register(entry: Omit<SkillEntry, 'status'>): void {
    const key = this.normalizeName(entry.name);
    this.skills.set(key, { ...entry, status: 'loaded', name: key });
  }

  unregister(name: string): boolean {
    return this.skills.delete(this.normalizeName(name));
  }

  get(name: string): SkillEntry | undefined {
    return this.skills.get(this.normalizeName(name));
  }

  has(name: string): boolean {
    return this.skills.has(this.normalizeName(name));
  }

  getAll(): SkillEntry[] {
    return Array.from(this.skills.values());
  }

  getByCategory(category: SkillEntry['category']): SkillEntry[] {
    return this.getAll().filter((s) => s.category === category);
  }

  clear(): void {
    this.skills.clear();
  }

  private normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/[\s_]+/g, '-');
  }
}
