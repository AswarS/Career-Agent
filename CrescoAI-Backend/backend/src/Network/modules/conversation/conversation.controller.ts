import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import contentDisposition from 'content-disposition';
import { readFile } from 'node:fs/promises';
import type { Request, Response } from 'express';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMultimodalMessageDto } from './dto/send-multimodal-message.dto';
import { RespondToToolDto } from './dto/respond-to-tool.dto';
import { OwnershipGuard } from '../auth/ownership.guard';

@Controller('api/career-agent/threads')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateConversationDto) {
    if (!req.userId) {
      throw new ForbiddenException('Missing user identity');
    }
    return this.conversationService.createConversation(dto, req.userId);
  }

  @Get(':id')
  getByUserId(@Req() req: Request, @Param('id') uid: string) {
    const requestedUserId = Number(uid);
    const currentUserId = req.userId;
    if (!currentUserId) {
      throw new ForbiddenException('Missing user identity');
    }
    if (Number.isInteger(requestedUserId) && requestedUserId !== currentUserId) {
      throw new ForbiddenException('You do not have access to this user conversations');
    }
    return this.conversationService.listConversations(currentUserId);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(OwnershipGuard)
  async delete(@Req() req: Request, @Param('id') conversationId: string) {
    if (!req.userId) {
      throw new ForbiddenException('Missing user identity');
    }

    await this.conversationService.deleteConversation(conversationId, req.userId);
  }

  @Get(':id/messages')
  @UseGuards(OwnershipGuard)
  listMessages(@Req() req: Request, @Param('id') conversationId: string) {
    return this.conversationService.listMessages(conversationId, req.userId);
  }

  @Post(':id/messages/stream')
  @UseGuards(OwnershipGuard)
  async streamMessage(
    @Req() req: Request,
    @Param('id') conversationId: string,
    @Body() dto: SendMultimodalMessageDto,
    @Res() response: Response,
  ) {
    const abortController = new AbortController();
    let sequence = 0;
    const abortOnDisconnect = () => {
      if (!response.writableEnded) {
        abortController.abort();
      }
    };

    req.once('aborted', abortOnDisconnect);
    response.once('close', abortOnDisconnect);

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();

    const heartbeat = setInterval(() => {
      if (!response.destroyed && !response.writableEnded) {
        response.write(': keepalive\n\n');
      }
    }, 15_000);
    heartbeat.unref?.();

    const writeEvent = (event: Record<string, unknown> & { type: string }) => {
      sequence += 1;
      response.write(`id: ${sequence}\n`);
      response.write(`event: ${event.type}\n`);
      response.write(`data: ${JSON.stringify({ sequence, ...event })}\n\n`);
    };

    try {
      for await (const event of this.conversationService.sendMessageStream(
        conversationId,
        dto,
        req.userId,
        abortController.signal,
      )) {
        if (abortController.signal.aborted || response.destroyed) {
          break;
        }
        writeEvent(event);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'message stream failed';
      if (!response.destroyed) {
        writeEvent({ type: 'error', message });
      }
    } finally {
      clearInterval(heartbeat);
      req.removeListener('aborted', abortOnDisconnect);
      response.removeListener('close', abortOnDisconnect);
      if (!response.destroyed) {
        response.end();
      }
    }
  }

  @Post(':id/messages')
  @UseGuards(OwnershipGuard)
  sendMessage(
    @Req() req: Request,
    @Param('id') conversationId: string,
    @Body() dto: SendMultimodalMessageDto,
  ) {
    return this.conversationService.sendMessage(conversationId, dto, req.userId);
  }

  @Post(':id/tool-responses/:toolUseId')
  @UseGuards(OwnershipGuard)
  respondToInteractiveTool(
    @Req() req: Request,
    @Param('id') conversationId: string,
    @Param('toolUseId') toolUseId: string,
    @Body() dto: RespondToToolDto,
  ) {
    return this.conversationService.respondToInteractiveTool(
      conversationId,
      toolUseId,
      dto,
      req.userId,
    );
  }

  @Post(':id/files')
  @UseGuards(OwnershipGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  uploadFile(
    @Req() req: Request,
    @Param('id') conversationId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.conversationService.uploadConversationFile(conversationId, file, req.userId);
  }

  @Get(':id/files/:fileName')
  @UseGuards(OwnershipGuard)
  async getFile(
    @Req() req: Request,
    @Param('id') conversationId: string,
    @Param('fileName') fileName: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { asset, absolutePath } = await this.conversationService.getConversationFile(
      conversationId,
      fileName,
      req.userId,
    );
    response.setHeader('Content-Type', asset.mime_type);
    response.setHeader('Content-Disposition', contentDisposition(asset.originalName, { type: 'inline' }));

    return new StreamableFile(await readFile(absolutePath));
  }
}
