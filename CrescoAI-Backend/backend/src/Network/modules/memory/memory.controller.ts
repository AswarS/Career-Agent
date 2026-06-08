import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { MemoryService } from './memory.service';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { QueryMemoryDto } from './dto/query-memory.dto';

@Controller('api/career-agent/memories')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Get()
  list(@Req() req: Request, @Query() query: QueryMemoryDto) {
    return this.memoryService.listMemories(req.userId!, query.category);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateMemoryDto) {
    return this.memoryService.createMemory(req.userId!, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: number) {
    return this.memoryService.deleteMemory(req.userId!, id);
  }
}
