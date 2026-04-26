import { Injectable } from '@nestjs/common';
import {
  AgentConversationMetadata,
  AgentCreateConversationInput,
  AgentSendMessageInput,
  AgentSendMessageResult,
  createConversation,
  sendMessage,
} from './agent.runtime';

@Injectable()
export class AgentService {
  createConversation(
    input: AgentCreateConversationInput,
  ): Promise<AgentConversationMetadata> {
    return createConversation(input);
  }

  sendMessage(input: AgentSendMessageInput): Promise<AgentSendMessageResult> {
    return sendMessage(input);
  }
}
