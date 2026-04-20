import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationEntity } from './entities/conversation.entity';
import { MessageEntity } from './entities/message.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { AgentService } from '../agent/agent.service';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,

    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,

    private readonly agentService: AgentService,
  ) {}

  async createConversation(dto: CreateConversationDto) {
    const conversation = this.conversationRepo.create(dto);
    return this.conversationRepo.save(conversation);
  }

  async getConversationById(id: number) {
    const conversation = await this.conversationRepo.findOne({
      where: { id: id },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }
    return conversation;
  }
  async listConversations(uid: number){
    return this.conversationRepo.find({
      where: { userId: uid },
      order: { createdAt: 'ASC' },
    });
  }
  async listMessages(conversationId: number) {
    await this.getConversationById(conversationId);

    return this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }
}
