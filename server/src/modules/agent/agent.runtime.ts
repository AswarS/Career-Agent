export interface AgentRunInput {
  conversationId: string;
  userId?: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  userMessage: string;
  context?: Record<string, any>;
}

export interface AgentRunResult {
  reply: string;
  raw?: Record<string, any>;
}

export function runAgent(input: AgentRunInput): AgentRunResult {
  // 这里替换成你自己的 agent 逻辑
  // 例如：调用 LLM、工具调用、RAG 检索、工作流编排等
  const last = input.userMessage;

  return {
    reply: `Agent 已收到：${last}`,
    raw: {
      type: 'stub',
      conversationId: input.conversationId,
    },
  };
}
