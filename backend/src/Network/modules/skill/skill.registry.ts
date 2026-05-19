import { Injectable } from '@nestjs/common';

export type SkillStatus = 'loaded' | 'unloaded';

export interface SkillHandlerResult {
  success: boolean;
  reply: string;
  metadata?: Record<string, unknown>;
}

export type SkillHandler = (
  args: string,
  context?: Record<string, unknown>,
) => Promise<SkillHandlerResult>;

export interface SkillEntry {
  name: string;
  description: string;
  status: SkillStatus;
  handler: SkillHandler;
}

@Injectable()
export class SkillRegistry {
  private readonly skills = new Map<string, SkillEntry>();

  register(
    name: string,
    description: string,
    handler: SkillHandler,
  ): void {
    const key = this.normalizeName(name);
    this.skills.set(key, {
      name: key,
      description,
      status: 'loaded',
      handler,
    });
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

  setLoaded(name: string): void {
    const entry = this.skills.get(this.normalizeName(name));
    if (entry) {
      entry.status = 'loaded';
    }
  }

  setUnloaded(name: string): void {
    const entry = this.skills.get(this.normalizeName(name));
    if (entry) {
      entry.status = 'unloaded';
    }
  }

  getAll(): SkillEntry[] {
    return Array.from(this.skills.values());
  }

  clear(): void {
    this.skills.clear();
  }

  private normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/[\s_]+/g, '-');
  }
}
