import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { readFile } from 'node:fs/promises';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMultimodalMessageDto } from './dto/send-multimodal-message.dto';
@Controller('api/career-agent/threads')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  create(@Body() dto: CreateConversationDto, @Req() request: AuthenticatedRequest) {
    return this.conversationService.createConversation(
      dto,
      Number(request.user!.id),
    );
  }

  @Get(':id/messages')
  listMessages(
    @Param('id') conversationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.conversationService.listMessages(
      conversationId,
      Number(request.user!.id),
    );
  }

  @Post(':id/messages')
  sendMessage(
    @Param('id') conversationId: string,
    @Body() dto: SendMultimodalMessageDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.conversationService.sendMessage(
      conversationId,
      dto,
      Number(request.user!.id),
    );
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
    @Req() request: AuthenticatedRequest,
  ) {
    return this.conversationService.uploadConversationFile(
      conversationId,
      file,
      Number(request.user!.id),
    );
  }

  @Get(':id/files/:fileName')
  async getFile(
    @Param('id') conversationId: string,
    @Param('fileName') fileName: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { asset, absolutePath } = await this.conversationService.getConversationFile(
      conversationId,
      fileName,
      Number(request.user!.id),
    );
    const contentDisposition = require('content-disposition')
    response.setHeader('Content-Type', asset.mime_type);
    response.setHeader('Content-Disposition', contentDisposition(asset.originalName, { type: 'inline' }));

    return new StreamableFile(await readFile(absolutePath));
  }

  @Get(':id')
  getByUserId(@Param('id') uid: string, @Req() request: AuthenticatedRequest) {
    const userId = Number(request.user?.id ?? uid);
    return this.conversationService.listConversations(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deleteConversation(
    @Param('id') conversationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.conversationService.deleteConversation(
      conversationId,
      Number(request.user!.id),
    );
  }
}
