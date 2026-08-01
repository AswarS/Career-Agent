import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  createPublicKey,
  createHmac,
  generateKeyPairSync,
  randomUUID,
  verify,
} from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { UserEntity } from '../src/Network/modules/user/entities/user.entity.js';
import { IntegrationOutboxEntity } from '../src/Network/modules/integration/entities/integration-outbox.entity.js';
import { PraxisIntegrationService } from '../src/Network/modules/integration/praxis-integration.service.js';
import { PraxisSsoService } from '../src/Network/modules/integration/praxis-sso.service.js';
import { PraxisOutboxPublisherService } from '../src/Network/modules/integration/praxis-outbox-publisher.service.js';
import { applyPublicAccountPatch } from '../src/Network/modules/integration/account-publication.js';

const USER_ID = 'b26f5098-7f4a-4f4f-91ef-965fb9c14e7f';

function userRecord(overrides: Partial<UserEntity> = {}) {
  return {
    userId: undefined,
    publicUserId: USER_ID,
    email: 'demo@example.com',
    username: 'demo',
    displayName: '测试用户一',
    avatarUrl: null,
    passwordHash: null,
    profileJson: '{}',
    refreshTokenHash: null,
    refreshTokenExpiresAt: null,
    tokenVersion: 0,
    accountStatus: 'active' as const,
    accountVersion: 42,
    ...overrides,
  };
}

describe('Praxis production integration boundary', () => {
  let dataSource: DataSource;
  let databasePath: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    process.env.CAREER_AGENT_PRAXIS_INTEGRATION_ENABLED = 'true';
    delete process.env.CAREER_AGENT_PRAXIS_SSO_PRIVATE_KEY;
    delete process.env.CAREER_AGENT_PRAXIS_SSO_ALGORITHM;
    delete process.env.CAREER_AGENT_PRAXIS_SERVICE_CREDENTIALS_JSON;
    delete process.env.CAREER_AGENT_PRAXIS_EVENT_SIGNING_KEYS_JSON;
    delete process.env.CAREER_AGENT_PRAXIS_EVENT_SIGNING_KID;
    delete process.env.CAREER_AGENT_PRAXIS_SSO_ACTIVE_KID;
    delete process.env.CAREER_AGENT_PRAXIS_SSO_VERIFICATION_KEYS_JSON;
    process.env.CAREER_AGENT_PRAXIS_BASE_URL = 'http://localhost:8000';
    process.env.CAREER_AGENT_PRAXIS_ISSUER = 'http://localhost:4000';
    databasePath = join(tmpdir(), `career-praxis-${randomUUID()}.sqlite`);
    dataSource = new DataSource({
      type: 'sqlite',
      database: databasePath,
      entities: [UserEntity, IntegrationOutboxEntity],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    delete process.env.CAREER_AGENT_PRAXIS_INTEGRATION_ENABLED;
    delete process.env.CAREER_AGENT_PRAXIS_BASE_URL;
    delete process.env.CAREER_AGENT_PRAXIS_ISSUER;
    delete process.env.CAREER_AGENT_PRAXIS_SSO_PRIVATE_KEY;
    delete process.env.CAREER_AGENT_PRAXIS_SSO_ACTIVE_KID;
    delete process.env.CAREER_AGENT_PRAXIS_SSO_VERIFICATION_KEYS_JSON;
    if (dataSource.isInitialized) await dataSource.destroy();
    await rm(databasePath, { force: true });
  });

  it('issues a 60-second ES256 ticket whose sub is the public UUID', async () => {
    const user = await dataSource.getRepository(UserEntity).save(userRecord());
    const service = new PraxisSsoService(dataSource.getRepository(UserEntity));

    const issued = await service.issueTicket(user.id);
    const [encodedHeader, encodedPayload, encodedSignature] =
      issued.ticket.split('.');
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
    const jwk = service.jwks().keys[0];

    expect(header).toMatchObject({ alg: 'ES256', kid: 'career-dev' });
    expect(payload.sub).toBe(USER_ID);
    expect(payload.aud).toBe('praxis-agent');
    expect(payload.exp - payload.iat).toBe(60);
    expect(payload.jti).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(verify(
      'sha256',
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      {
        key: createPublicKey({ key: jwk, format: 'jwk' }),
        dsaEncoding: 'ieee-p1363',
      },
      Buffer.from(encodedSignature, 'base64url'),
    )).toBe(true);
    expect(issued.targetUrl).toBe('http://localhost:8000/api/v1/auth/sso');
  });

  it('serves fixed-width authoritative account and profile versions', async () => {
    await dataSource.getRepository(UserEntity).save(userRecord());
    const snapshots = {
      getCurrentSnapshot: async () => ({
        externalUserId: USER_ID,
        profileVersion: '7',
        schemaVersion: '2.0',
        updatedAt: '2026-08-01T08:00:00.000Z',
        profile: { base: {}, memories: [] },
        contentHash: 'a'.repeat(64),
      }),
    };
    const service = new PraxisIntegrationService(
      dataSource.getRepository(UserEntity),
      snapshots as never,
    );

    const account = await service.getAccount(USER_ID);
    const profile = await service.getProfile(USER_ID);
    const directory = await service.searchDirectory('测试', undefined, '50');

    expect(account.sourceVersion).toBe('00000000000000000042');
    expect(account.avatarUrl).toBeNull();
    expect(profile.profileVersion).toBe('00000000000000000007');
    expect(directory.items).toEqual([{
      externalUserId: USER_ID,
      displayName: '测试用户一',
      avatarUrl: null,
      accountStatus: 'active',
    }]);
  });

  it('publishes active and retained SSO verification keys in JWKS', async () => {
    const active = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const retained = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    process.env.CAREER_AGENT_PRAXIS_SSO_PRIVATE_KEY = active.privateKey.export({
      format: 'pem',
      type: 'pkcs8',
    }).toString();
    process.env.CAREER_AGENT_PRAXIS_SSO_ACTIVE_KID = 'career-active';
    process.env.CAREER_AGENT_PRAXIS_SSO_VERIFICATION_KEYS_JSON = JSON.stringify({
      'career-retained': retained.publicKey.export({
        format: 'pem',
        type: 'spki',
      }).toString(),
    });
    const user = await dataSource.getRepository(UserEntity).save(userRecord());
    const service = new PraxisSsoService(dataSource.getRepository(UserEntity));

    const issued = await service.issueTicket(user.id);
    const header = JSON.parse(
      Buffer.from(issued.ticket.split('.')[0], 'base64url').toString(),
    );
    const jwks = service.jwks();

    expect(header.kid).toBe('career-active');
    expect(jwks.keys.map((key) => key.kid)).toEqual([
      'career-active',
      'career-retained',
    ]);
  });

  it('signs and publishes an account event exactly once', async () => {
    const payload = JSON.stringify({
      eventId: 'event_account_demo001',
      eventType: 'account.status.changed',
      externalUserId: USER_ID,
      status: 'disabled',
      sourceVersion: '00000000000000000043',
      occurredAt: '2026-08-01T08:05:00.000Z',
    });
    await dataSource.getRepository(IntegrationOutboxEntity).save({
      id: 'event_account_demo001',
      eventType: 'account.status.changed',
      aggregateType: 'user',
      aggregateId: USER_ID,
      aggregateVersion: 43,
      payloadJson: payload,
      status: 'pending',
      attempts: 0,
      availableAt: new Date(0),
      publishedAt: null,
      lockToken: null,
      lockedAt: null,
      lastError: null,
    });
    let captured: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      captured = init;
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    const publisher = new PraxisOutboxPublisherService(
      dataSource,
      dataSource.getRepository(IntegrationOutboxEntity),
    );

    expect(await publisher.publishAvailable()).toBe(1);
    const saved = await dataSource.getRepository(IntegrationOutboxEntity)
      .findOneByOrFail({ id: 'event_account_demo001' });
    expect(saved.status).toBe('published');
    expect(saved.attempts).toBe(1);

    const signatureHeader = new Headers(captured!.headers)
      .get('X-Service-Signature')!;
    const match = signatureHeader.match(
      /^v1;kid=career-dev;t=(\d+);sig=([A-Za-z0-9_-]+)$/,
    );
    expect(match).not.toBeNull();
    const expected = createHmac(
      'sha256',
      'career-development-event-secret',
    )
      .update(`${match![1]}\nevent_account_demo001\n${payload}`)
      .digest('base64url');
    expect(match![2]).toBe(expected);
    expect(await publisher.publishAvailable()).toBe(0);
  });

  it('versions public account fields and emits status changes atomically', async () => {
    const user = await dataSource.getRepository(UserEntity).save(userRecord());
    await dataSource.transaction(async (manager) => {
      const managed = await manager.findOneByOrFail(UserEntity, { id: user.id });
      await applyPublicAccountPatch(manager, managed, {
        displayName: 'Updated User',
        avatarUrl: 'http://unsafe.example/avatar.png',
        accountStatus: 'disabled',
      });
    });

    const updated = await dataSource.getRepository(UserEntity)
      .findOneByOrFail({ id: user.id });
    const events = await dataSource.getRepository(IntegrationOutboxEntity)
      .find();
    expect(updated).toMatchObject({
      displayName: 'Updated User',
      avatarUrl: null,
      accountStatus: 'disabled',
      accountVersion: 43,
    });
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].payloadJson)).toMatchObject({
      externalUserId: USER_ID,
      status: 'disabled',
      sourceVersion: '00000000000000000043',
    });
  });

  it('does not claim an event before its availableAt time', async () => {
    const payload = JSON.stringify({ eventId: 'event_future_demo001' });
    await dataSource.getRepository(IntegrationOutboxEntity).save({
      id: 'event_future_demo001',
      eventType: 'account.status.changed',
      aggregateType: 'user',
      aggregateId: USER_ID,
      aggregateVersion: 44,
      payloadJson: payload,
      status: 'pending',
      attempts: 0,
      availableAt: new Date(Date.now() + 60_000),
      publishedAt: null,
      lockToken: null,
      lockedAt: null,
      lastError: null,
    });
    globalThis.fetch = (() => {
      throw new Error('future event must not be published');
    }) as unknown as typeof fetch;
    const publisher = new PraxisOutboxPublisherService(
      dataSource,
      dataSource.getRepository(IntegrationOutboxEntity),
    );

    expect(await publisher.publishAvailable()).toBe(0);
    const saved = await dataSource.getRepository(IntegrationOutboxEntity)
      .findOneByOrFail({ id: 'event_future_demo001' });
    expect(saved.status).toBe('pending');
    expect(saved.attempts).toBe(0);
  });
});
