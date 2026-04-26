import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { readFile } from 'node:fs/promises';
import type { Response } from 'express';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMultimodalMessageDto } from './dto/send-multimodal-message.dto';

@Controller('api/career-agent/threads')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  create(@Body() dto: CreateConversationDto) {
    return this.conversationService.createConversation(dto);
  }

  @Get(':id')
  getByUserId(@Param('id') uid: string) {
    const userId = Number(uid);
    return this.conversationService.listConversations(userId);
  }

  @Get(':id/messages')
  listMessages(@Param('id') conversationId: string) {
    return this.conversationService.listMessages(conversationId);
  }

  @Post(':id/messages')
  sendMessage(
    @Param('id') conversationId: string,
    @Body() dto: SendMultimodalMessageDto,
  ) {
    return this.conversationService.sendMessage(conversationId, dto);
  }

  @Post(':id/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  uploadFile(
    @Param('id') conversationId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.conversationService.uploadConversationFile(conversationId, file);
  }

  @Get(':id/files/:fileName')
  async getFile(
    @Param('id') conversationId: string,
    @Param('fileName') fileName: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { asset, absolutePath } = await this.conversationService.getConversationFile(
      conversationId,
      fileName,
    );

    response.setHeader('Content-Type', asset.mime_type);
    response.setHeader('Content-Disposition', `inline; filename="${asset.original_name}"`);

    return new StreamableFile(await readFile(absolutePath));
  }
}
