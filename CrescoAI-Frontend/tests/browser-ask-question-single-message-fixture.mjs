import { createServer } from 'node:http';

const threadId = 'thread-browser-ask-question-single-message';
const assistantMessageId = 'message-single-assistant';
const now = '2026-08-07T13:20:00.000Z';
const answerByTool = new Map();
const streamBlocks = [];

const questions = [
  '你希望先完善哪一部分计划？',
  '你的英语面试准备处于什么阶段？',
  '你更想优先准备哪类公司？',
];

function userMessage(id, content, createdAt) {
  return {
    id,
    thread_id: threadId,
    role: 'user',
    kind: 'markdown',
    content,
    created_at: createdAt,
  };
}

function assistantMessage(blocks, streaming = false) {
  const textBlocks = blocks.filter((block) => block.type === 'text');
  return {
    id: assistantMessageId,
    thread_id: threadId,
    role: 'assistant',
    kind: 'markdown',
    content: textBlocks.at(-1)?.text ?? '',
    created_at: '2026-08-07T13:21:00.000Z',
    stop_reason: streaming ? 'tool_use' : 'end_turn',
    agent_id: 'fixture-agent',
    agent_name: '测试助手',
    blocks,
    streaming,
  };
}

const beforeMessages = [
  userMessage('message-before-user', '请帮我梳理学习计划。', '2026-08-07T13:19:00.000Z'),
  {
    ...assistantMessage([{
      id: 'before-text',
      type: 'text',
      text: '这是较长的前置对话，用来确保滚动区域有足够高度。',
    }]),
    id: 'message-before-assistant',
  },
];

function textBlock(index) {
  return {
    id: `single-text-${index}`,
    type: 'text',
    text: [
      '第一段回复：先确认总体目标和优先级。',
      '第二段回复：上一题完成后继续确认下一项。',
      '第三段回复：继续确认最后一个关键条件。',
      '最终后续回复：已经收齐答案，接下来生成完整计划。',
    ][index - 1],
  };
}

function askBlock(index, status = 'pending') {
  const toolUseId = `tool-single-question-${index}`;
  return {
    id: `single-ask-${index}`,
    type: 'ask_question',
    title: '需要你的选择',
    name: 'AskUserQuestion',
    toolUseId,
    status,
    questions: [{
      header: `问题 ${index}`,
      question: questions[index - 1],
      multiSelect: false,
      options: [
        { label: '选项 A', description: '验证单条 assistant message 中的锚点。' },
        { label: '选项 B', description: '验证后续 block 不会把首个问题推走。' },
      ],
    }],
  };
}

function toolResultBlock(index) {
  return {
    id: `single-result-${index}`,
    type: 'tool_result',
    title: '问题回答',
    toolUseId: `tool-single-question-${index}`,
    status: 'completed',
    answers: { [questions[index - 1]]: '选项 A' },
  };
}

function currentBlocks() {
  return streamBlocks.map((block) => ({ ...block }));
}

function completedMessages() {
  return [
    ...beforeMessages,
    assistantMessage([
      textBlock(1),
      askBlock(1, 'completed'),
      toolResultBlock(1),
      textBlock(2),
      askBlock(2, 'completed'),
      toolResultBlock(2),
      textBlock(3),
      askBlock(3, 'completed'),
      toolResultBlock(3),
      textBlock(4),
    ]),
  ];
}

let streamResponse = null;

function writeSseEvent(event) {
  streamResponse?.write(`data: ${JSON.stringify(event)}\n\n`);
}

function appendBlock(block) {
  const index = streamBlocks.findIndex((candidate) => candidate.id === block.id);
  if (index < 0) {
    streamBlocks.push(block);
  } else {
    streamBlocks[index] = block;
  }
  writeSseEvent({
    type: 'message.block.completed',
    conversation_id: threadId,
    message_id: assistantMessageId,
    block,
  });
}

function finishStream() {
  appendBlock(textBlock(4));
  writeSseEvent({
    type: 'message.completed',
    conversation_id: threadId,
    message_id: 'message-user-1',
    assistant_message_id: assistantMessageId,
    accepted: true,
    status: 'done',
    reply: textBlock(4).text,
    stop_reason: 'end_turn',
    blocks: currentBlocks(),
  });
  streamResponse?.end();
  streamResponse = null;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  response.end(JSON.stringify(payload));
}

const server = createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url ?? '/', 'http://127.0.0.1:4002');
  const path = url.pathname;

  if (request.method === 'GET' && path === '/api/career-agent/threads') {
    sendJson(response, 200, [{
      id: threadId,
      title: '单条消息多轮 askQuestion 验证',
      preview: '一个 assistant message 内逐步追加多个 text 与 askQuestion block。',
      updated_at: now,
      status: 'active',
    }]);
    return;
  }

  if (request.method === 'GET' && path === `/api/career-agent/threads/${threadId}/messages`) {
    sendJson(response, 200, streamBlocks.some((block) => block.id === 'single-result-3')
      ? completedMessages()
      : beforeMessages);
    return;
  }

  if (request.method === 'POST' && path === `/api/career-agent/threads/${threadId}/messages/stream`) {
    streamBlocks.length = 0;
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    streamResponse = response;
    writeSseEvent({
      type: 'message.created',
      conversation_id: threadId,
      message_id: 'message-user-1',
      assistant_message_id: assistantMessageId,
      created_at: '2026-08-07T13:21:00.000Z',
    });
    appendBlock(textBlock(1));
    appendBlock(askBlock(1));
    return;
  }

  const toolMatch = path.match(new RegExp(`/api/career-agent/threads/${threadId}/tool-responses/(tool-single-question-[1-3])`));
  if (request.method === 'POST' && toolMatch) {
    const toolUseId = toolMatch[1];
    answerByTool.set(toolUseId, '选项 A');
    sendJson(response, 200, { accepted: true });

    const index = Number(toolUseId.at(-1));
    setTimeout(() => {
      appendBlock(askBlock(index, 'completed'));
      appendBlock(toolResultBlock(index));
      if (index < 3) {
        appendBlock(textBlock(index + 1));
        appendBlock(askBlock(index + 1));
      } else {
        finishStream();
      }
    }, 900);
    return;
  }

  if (request.method === 'GET' && (
    path === '/api/career-agent/profile'
    || path === '/api/career-agent/profile/suggestions'
    || path === '/api/career-agent/artifacts'
  )) {
    sendJson(response, 200, []);
    return;
  }

  if (request.method === 'GET' && path === '/api/career-agent/auth/session') {
    sendJson(response, 200, null);
    return;
  }

  sendJson(response, 404, { message: 'single-message fixture route not found' });
});

server.listen(4002, '127.0.0.1', () => {
  console.log('Single-message askQuestion fixture listening on http://127.0.0.1:4002');
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
