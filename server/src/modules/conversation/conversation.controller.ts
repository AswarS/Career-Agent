import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Controller('api/career-agent/threads')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  create(@Body() dto: CreateConversationDto) {
    return this.conversationService.createConversation(dto);
  }

  @Get(':id')
  getById(@Param('id') uid: number) {
    return this.conversationService.listConversations(uid);
  }

  @Get(':id/messages')
  listMessages(@Param('id') cid: number) {
    return this.conversationService.listMessages(cid);
  }
}
