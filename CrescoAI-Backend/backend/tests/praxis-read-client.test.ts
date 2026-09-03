import { describe, expect, test } from 'bun:test';
import { createHash, createPublicKey, verify } from 'node:crypto';
import {
  canonicalizePraxisJson,
  PraxisReadClientService,
  PraxisReadError,
} from '../src/Network/modules/integration/praxis-read.client.js';
import {
  resolvePraxisReadIntegrationConfig,
  type PraxisReadIntegrationConfig,
} from '../src/Network/modules/integration/praxis-integration.config.js';
import { isPraxisReadResponse } from '../src/Network/modules/integration/praxis-read.contract.js';
import workspaceResponse from './fixtures/praxis-read-response-workspace.json';
import runResponse from './fixtures/praxis-read-response-run.json';
import internalFieldResponse from './fixtures/praxis-read-response-internal-field.json';

const PUBLIC_USER_ID = '11111111-1111-4111-8111-111111111111';
const TEST_CONFIG = resolvePraxisReadIntegrationConfig({
  NODE_ENV: 'test',
  CAREER_AGENT_PRAXIS_INTEGRATION_ENABLED: 'true',
  CAREER_AGENT_PRAXIS_READ_ENABLED: 'true',
  CAREER_AGENT_PRAXIS_BASE_URL: 'http://praxis.test',
  CAREER_AGENT_PRAXIS_READ_BASE_URL: 'http://praxis.test',
  CAREER_AGENT_PRAXIS_ISSUER: 'http://career.test',
});

class TestPraxisReadClient extends PraxisReadClientService {
  constructor(
    userRepo: never,
    private readonly config: PraxisReadIntegrationConfig,
    private readonly fetchImpl: typeof fetch,
  ) {
    super(userRepo);
  }

  protected override resolveConfig() {
    return this.config;
  }

  protected override performFetch(url: string, init: RequestInit) {
    return this.fetchImpl(url, init);
  }
}

describe('Praxis read client 1.0.0', () => {
  test('uses RFC 8785 canonical body hashing from the handoff fixture', () => {
    const body = canonicalizePraxisJson({
      schemaVersion: '1.0.0',
      toolCallId: 'toolcall_workspace_001',
      view: 'workspace_overview',
    });
    expect(createHash('sha256').update(body).digest('hex')).toBe(
      'a1dba98389b6419ab76a41a49aa4d5198a0146c1814aa149aa4a463a9862697a',
    );
  });

  test('rejects provider fields forbidden by the frozen response schema', () => {
    expect(isPraxisReadResponse(workspaceResponse)).toBe(true);
    expect(isPraxisReadResponse(internalFieldResponse)).toBe(false);
  });

  test('injects identity, signed request scope, selection binding, and read budget', async () => {
    const requests: Array<Record<string, unknown>> = [];
    const tokens: string[] = [];
    const fetchImpl = (async (url, init) => {
      expect(url).toBe('http://praxis.test/integration/cresco/v1/read');
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(request);
      const token = String(
        (init?.headers as Record<string, string>).Authorization,
      ).replace(/^Bearer /, '');
      tokens.push(token);
      const [header, payload, signature] = token.split('.');
      const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString());
      const config = TEST_CONFIG;
      expect(
        verify(
          'sha256',
          Buffer.from(`${header}.${payload}`),
          {
            key: createPublicKey(config.privateKey),
            dsaEncoding: 'ieee-p1363',
          },
          Buffer.from(signature!, 'base64url'),
        ),
      ).toBe(true);
      expect(claims).toMatchObject({
        aud: 'praxis-read-api',
        sub: PUBLIC_USER_ID,
        method: 'POST',
        path: '/integration/cresco/v1/read',
        contractVersion: '1.0.0',
        toolCallId: request.toolCallId,
      });
      expect(claims.requestBodySha256).toBe(
        createHash('sha256').update(String(init?.body)).digest('hex'),
      );

      const result =
        request.view === 'workspace_overview'
          ? structuredClone(workspaceResponse)
          : structuredClone(runResponse);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const userRepo = {
      findOne: async () => ({
        id: 1,
        publicUserId: PUBLIC_USER_ID,
        accountStatus: 'active',
      }),
    };
    const client = new TestPraxisReadClient(
      userRepo as never,
      TEST_CONFIG,
      fetchImpl,
    );
    const common = {
      userId: '1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
    };

    await client.read(
      { view: 'workspace_overview' },
      { ...common, toolCallId: 'toolcall_workspace_001' },
    );
    await client.read(
      { view: 'run_context' },
      { ...common, toolCallId: 'toolcall_run_001' },
    );

    expect(requests).toEqual([
      {
        schemaVersion: '1.0.0',
        toolCallId: 'toolcall_workspace_001',
        view: 'workspace_overview',
      },
      {
        schemaVersion: '1.0.0',
        toolCallId: 'toolcall_run_001',
        view: 'run_context',
        scope: { projectId: 'project_demo001', runId: 'run_demo001' },
      },
    ]);
    expect(tokens).toHaveLength(2);
    const firstJti = JSON.parse(
      Buffer.from(tokens[0]!.split('.')[1]!, 'base64url').toString(),
    ).jti;
    const secondJti = JSON.parse(
      Buffer.from(tokens[1]!.split('.')[1]!, 'base64url').toString(),
    ).jti;
    expect(firstJti).not.toBe(secondJti);

    try {
      await client.read(
        { view: 'project_overview' },
        { ...common, toolCallId: 'toolcall_project_001' },
      );
      throw new Error('expected read budget rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(PraxisReadError);
      expect((error as PraxisReadError).code).toBe('READ_BUDGET_EXCEEDED');
    }
  });

  test('re-signs TOKEN_EXPIRED once without changing body or toolCallId', async () => {
    const bodies: string[] = [];
    const tokenIds: string[] = [];
    let attempt = 0;
    const fetchImpl = (async (_url, init) => {
      attempt += 1;
      bodies.push(String(init?.body));
      const token = String(
        (init?.headers as Record<string, string>).Authorization,
      ).replace(/^Bearer /, '');
      const claims = JSON.parse(
        Buffer.from(token.split('.')[1]!, 'base64url').toString(),
      );
      tokenIds.push(claims.jti);
      if (attempt === 1) {
        return new Response(
          JSON.stringify({
            schemaVersion: '1.0.0',
            traceId: 'trace_token_expired',
            toolCallId: 'toolcall_workspace_001',
            error: {
              code: 'TOKEN_EXPIRED',
              message: 'Read token expired.',
              retryable: false,
            },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(workspaceResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
    const client = new TestPraxisReadClient(
      {
        findOne: async () => ({
          id: 1,
          publicUserId: PUBLIC_USER_ID,
          accountStatus: 'active',
        }),
      } as never,
      TEST_CONFIG,
      fetchImpl,
    );

    await client.read(
      { view: 'workspace_overview' },
      {
        userId: '1',
        conversationId: 'conversation-retry',
        turnId: 'turn-retry',
        toolCallId: 'toolcall_workspace_001',
      },
    );

    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(tokenIds[0]).not.toBe(tokenIds[1]);
  });
});
