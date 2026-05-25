import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemoryEntity } from './entities/memory.entity';
import { CreateMemoryDto } from './dto/create-memory.dto';

@Injectable()
export class MemoryService {
  constructor(
    @InjectRepository(MemoryEntity)
    private readonly memoryRepo: Repository<MemoryEntity>,
  ) {}

  async listMemories(userId: number, category?: string) {
    const where: Record<string, unknown> = { userId };
    if (category) {
      where.category = category;
    }
    return this.memoryRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async createMemory(userId: number, dto: CreateMemoryDto) {
    const memory = this.memoryRepo.create({
      userId,
      content: dto.content,
      category: dto.category,
      tags: dto.tags ? dto.tags.split(',').map((t) => t.trim()) : undefined,
    });
    return this.memoryRepo.save(memory);
  }

  async deleteMemory(userId: number, memoryId: number) {
    const memory = await this.memoryRepo.findOne({ where: { id: memoryId } });
    if (!memory) {
      throw new NotFoundException(`Memory ${memoryId} not found`);
    }
    if (memory.userId !== userId) {
      throw new ForbiddenException('You do not have access to this memory');
    }
    await this.memoryRepo.remove(memory);
    return { deleted: true };
  }

  async deleteAllMemories(userId: number) {
    await this.memoryRepo.delete({ userId });
    return { deleted: true };
  }
}
