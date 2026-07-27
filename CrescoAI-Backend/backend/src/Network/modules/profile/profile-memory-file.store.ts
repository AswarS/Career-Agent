import { Injectable } from '@nestjs/common';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { getNetworkUserDir } from '../../utils/networkTranscriptStorage';

@Injectable()
export class ProfileMemoryFileStore {
  private readonly writes = new Map<number, Promise<void>>();

  getMemoryDir(userId: number) {
    return join(getNetworkUserDir(userId), 'memory');
  }

  async writeProjection(userId: number, files: { profile: string; index: string }) {
    const previous = this.writes.get(userId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const directory = this.getMemoryDir(userId);
      await mkdir(directory, { recursive: true });
      await this.atomicWrite(join(directory, 'profile.md'), files.profile);
      await this.atomicWrite(join(directory, 'MEMORY.md'), files.index);
    });
    this.writes.set(userId, next);
    try {
      await next;
    } finally {
      if (this.writes.get(userId) === next) this.writes.delete(userId);
    }
  }

  private async atomicWrite(target: string, content: string) {
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, target);
  }
}
