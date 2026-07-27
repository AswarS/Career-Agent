import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentService } from '../src/Network/modules/agent/agent.service.js';
import { createConversation as createRuntimeConversation } from '../src/Network/modules/agent/agent.runtime.js';
import type {
  AgentCreateConversationInput,
  AgentSendMessageInput,
  AgentStreamEvent,
} from '../src/Network/modules/agent/agent.runtime.js';

function createDeterministicAgentService() {
  return {
    async createConversation(input: AgentCreateConversationInput) {
      return createRuntimeConversation(input);
    },

    async *sendMessageStream(input: AgentSendMessageInput): AsyncGenerator<AgentStreamEvent> {
      const userMessageId = `smoke-user-${randomUUID()}`;
      const assistantMessageId = `smoke-assistant-${randomUUID()}`;
      const createdAt = new Date().toISOString();

      yield {
        type: 'message.created',
        conversationId: input.conversationId,
        userMessageId,
        assistantMessageId,
        createdAt,
      };
      yield {
        type: 'reasoning.delta',
        messageId: assistantMessageId,
        delta: '正在整理上传材料。',
      };
      yield {
        type: 'reply.delta',
        messageId: assistantMessageId,
        delta: '已生成联调周计划。',
      };
      yield {
        type: 'message.completed',
        accepted: true,
        status: 'done',
        conversationId: input.conversationId,
        userMessageId,
        assistantMessageId,
        reply: '已生成联调周计划。',
        reasoning: '正在整理上传材料。',
        generatedFiles: [
          {
            kind: 'html',
            url: 'https://example.test/smoke-weekly-plan.html',
            title: '联调周计划',
            mimeType: 'text/html',
          },
        ],
        raw: {
          profile_suggestion: {
            id: 'smoke-target-role',
            title: '确认目标岗位',
            rationale: '来自联调消息中的明确目标。',
            patch: {
              intentConstraints: {
                targetRole: 'AI 产品经理',
              },
            },
          },
        },
      };
    },
  };
}

describe('Career Agent HTTP smoke flow', () => {
  let app: INestApplication;
  let tempDatabaseDir = '';
  const previousJwtSecret = process.env.CAREER_AGENT_JWT_SECRET;
  const previousDatabasePath = process.env.CAREER_AGENT_DATABASE_PATH;

  beforeAll(async () => {
    process.env.CAREER_AGENT_JWT_SECRET = 'career-agent-http-smoke-secret';
    tempDatabaseDir = await mkdtemp(join(tmpdir(), 'career-agent-http-smoke-'));
    process.env.CAREER_AGENT_DATABASE_PATH = join(tempDatabaseDir, 'smoke.sqlite');
    const { AppModule } = await import('../src/Network/app.module.js');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AgentService)
      .useValue(createDeterministicAgentService())
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (previousJwtSecret === undefined) {
      delete process.env.CAREER_AGENT_JWT_SECRET;
    } else {
      process.env.CAREER_AGENT_JWT_SECRET = previousJwtSecret;
    }
    if (previousDatabasePath === undefined) {
      delete process.env.CAREER_AGENT_DATABASE_PATH;
    } else {
      process.env.CAREER_AGENT_DATABASE_PATH = previousDatabasePath;
    }
    if (tempDatabaseDir) {
      await rm(tempDatabaseDir, { recursive: true, force: true });
    }
  });

  test('login -> create thread -> upload -> stream -> review profile -> refresh artifact', async () => {
    const server = app.getHttpServer();
    const suffix = randomUUID();
    const email = `smoke-${suffix}@example.test`;
    const password = 'SmokePass-2026!';
    let accessToken = '';
    let userId = '';

    try {
      await request(server)
        .post('/api/career-agent/auth/register')
        .send({ email, password, display_name: 'Smoke User' })
        .expect(200);

      const loginResponse = await request(server)
        .post('/api/career-agent/auth/login')
        .send({ email, password })
        .expect(200);

      accessToken = loginResponse.body.access_token;
      userId = String(loginResponse.body.user.id);
      expect(accessToken).toBeTruthy();

      await request(server)
        .get('/api/career-agent/auth/session')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(server)
        .get('/api/career-agent/threads')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(server)
        .get('/api/career-agent/threads/not-a-user-identity')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);

      const threadResponse = await request(server)
        .post('/api/career-agent/threads')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: '联调冒烟测试', preview: '验证核心链路' })
        .expect(201);
      const threadId = String(threadResponse.body.id);

      const uploadResponse = await request(server)
        .post(`/api/career-agent/threads/${threadId}/files`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('smoke resume content'), {
          filename: 'resume.txt',
          contentType: 'text/plain',
        })
        .expect(201);
      expect(uploadResponse.body.asset_id).toBeTruthy();

      const streamResponse = await request(server)
        .post(`/api/career-agent/threads/${threadId}/messages/stream`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          kind: 'markdown',
          content: '请根据附件生成周计划并更新目标岗位建议',
          attachment_asset_ids: [uploadResponse.body.asset_id],
        })
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);
      expect(streamResponse.text).toContain('event: reasoning.delta');
      expect(streamResponse.text).toContain('event: artifact.created');
      expect(streamResponse.text).toContain('event: message.completed');

      const suggestionsResponse = await request(server)
        .get('/api/career-agent/profile/suggestions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const suggestion = suggestionsResponse.body.find(
        (item: { id?: string }) => item.id === 'smoke-target-role',
      );
      expect(suggestion?.patch?.intentConstraints?.targetRole).toBe('AI 产品经理');

      const profileResponse = await request(server)
        .put('/api/career-agent/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(suggestion.patch)
        .expect(200);
      expect(profileResponse.body.intentConstraints.targetRole).toBe('AI 产品经理');

      const artifactsResponse = await request(server)
        .get('/api/career-agent/artifacts')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const artifact = artifactsResponse.body.find(
        (item: { title?: string }) => item.title === '联调周计划',
      );
      expect(artifact?.id).toBeTruthy();

      const refreshResponse = await request(server)
        .post(`/api/career-agent/artifacts/${artifact.id}/refresh`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);
      expect(refreshResponse.body.id).toBe(artifact.id);
    } finally {
      if (accessToken && userId) {
        await request(server)
          .delete(`/api/career-agent/users/${userId}`)
          .set('Authorization', `Bearer ${accessToken}`);
      }
    }
  });
});
