import {
  Body,
  Controller,
  Get,
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
import { readFile } from 'node:fs/promises';
import type { Request, Response } from 'express';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMultimodalMessageDto } from './dto/send-multimodal-message.dto';
import { OwnershipGuard } from '../auth/ownership.guard';

@Controller('api/career-agent/threads')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateConversationDto) {
    return this.conversationService.createConversation(dto, req.userId);
  }

  @Get(':id')
  getByUserId(@Req() req: Request, @Param('id') uid: string) {
    const userId = Number(uid);
    return this.conversationService.listConversations(userId);
  }

  @Get(':id/messages')
  @UseGuards(OwnershipGuard)
  listMessages(@Req() req: Request, @Param('id') conversationId: string) {
    return this.conversationService.listMessages(conversationId);
  }

  @Post(':id/messages')
  @UseGuards(OwnershipGuard)
  sendMessage(
    @Req() req: Request,
    @Param('id') conversationId: string,
    @Body() dto: SendMultimodalMessageDto,
  ) {
    return this.conversationService.sendMessage(conversationId, dto);
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
    return this.conversationService.uploadConversationFile(conversationId, file);
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
    );
    const contentDisposition = require('content-disposition')
    response.setHeader('Content-Type', asset.mime_type);
    response.setHeader('Content-Disposition', contentDisposition(asset.originalName, { type: 'inline' }));

    return new StreamableFile(await readFile(absolutePath));
  }
}
