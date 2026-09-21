import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { PraxisBehaviorEventEntity } from '../src/Network/modules/integration/entities/praxis-behavior-event.entity.js';
import { PraxisBehaviorEventService } from '../src/Network/modules/integration/praxis-behavior-event.service.js';
import { UserEntity } from '../src/Network/modules/user/entities/user.entity.js';

const USER_ID = 'b26f5098-7f4a-4f4f-91ef-965fb9c14e7f';

function behaviorEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'pbe_behavior_demo001',
    schemaVersion: '1.12.0',
    eventType: 'profile.complete',
    externalUserId: USER_ID,
    actorType: 'authenticated_user',
    occurredAt: '2026-08-10T08:00:00Z',
    traceId: 'trace_behavior_demo001',
    sourceSystem: 'praxis',
    outcome: 'succeeded',
    resourceRefs: [{ resourceType: 'ProfileSession', resourceId: 'profile_demo001' }],
    facts: { completeness: 100, status: 'locked' },
    ...overrides,
  };
}

describe('Praxis behavior event receiver', () => {
  let dataSource: DataSource;
  let databasePath: string;
  let service: PraxisBehaviorEventService;

  beforeEach(async () => {
    databasePath = join(tmpdir(), `career-praxis-behavior-${randomUUID()}.sqlite`);
    dataSource = new DataSource({
      type: 'sqlite',
      database: databasePath,
      entities: [UserEntity, PraxisBehaviorEventEntity],
      synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.getRepository(UserEntity).save({
      publicUserId: USER_ID,
      email: 'behavior@example.test',
      username: 'behavior-user',
      displayName: 'Behavior User',
      avatarUrl: null,
      passwordHash: null,
      profileJson: '{}',
      refreshTokenHash: null,
      refreshTokenExpiresAt: null,
      tokenVersion: 0,
      accountStatus: 'active',
      accountVersion: 1,
    });
    service = new PraxisBehaviorEventService(
      dataSource,
      dataSource.getRepository(PraxisBehaviorEventEntity),
    );
  });

  afterEach(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
    await rm(databasePath, { force: true });
  });

  it('accepts a closed fact and records only a Profile review signal', async () => {
    const event = behaviorEvent();
    const result = await service.receive(
      event,
      event.eventId,
      event.traceId,
    );

    expect(result).toEqual({
      eventId: event.eventId,
      status: 'accepted',
      traceId: event.traceId,
    });
    const stored = await dataSource.getRepository(PraxisBehaviorEventEntity)
      .findOneByOrFail({ eventId: event.eventId });
    expect(stored).toMatchObject({
      evidenceDisposition: 'profile_review_signal',
      evidenceCategory: 'profile_completion',
      evidenceReason: 'closed_fact_requires_grounded_profile_review',
    });
    expect(JSON.parse(stored.factsJson)).toEqual(event.facts);
  });

  it('acknowledges an identical retry as a duplicate', async () => {
    const event = behaviorEvent();
    await service.receive(event, event.eventId, event.traceId);
    const duplicate = await service.receive(event, event.eventId, event.traceId);

    expect(duplicate.status).toBe('duplicate');
    expect(await dataSource.getRepository(PraxisBehaviorEventEntity).count())
      .toBe(1);
  });

  it('rejects reuse of an eventId with different content', async () => {
    const event = behaviorEvent();
    await service.receive(event, event.eventId, event.traceId);

    await expect(service.receive(
      behaviorEvent({ facts: { completeness: 99 } }),
      event.eventId,
      event.traceId,
    )).rejects.toMatchObject({ status: 409 });
  });

  it('rejects mismatched idempotency and trace headers', async () => {
    const event = behaviorEvent();
    await expect(service.receive(event, 'pbe_other_event', event.traceId))
      .rejects.toMatchObject({ status: 400 });
    await expect(service.receive(event, event.eventId, 'trace_other_event'))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects unknown or sensitive fields before persistence', async () => {
    const event = behaviorEvent({ rawAnswer: 'must never cross the boundary' });
    await expect(service.receive(
      event,
      String(event.eventId),
      String(event.traceId),
    )).rejects.toMatchObject({ status: 400 });
    expect(await dataSource.getRepository(PraxisBehaviorEventEntity).count())
      .toBe(0);
  });

  it('accepts the 1.12 conversation event and resource additions', async () => {
    const event = behaviorEvent({
      eventId: 'pbe_behavior_conversation001',
      eventType: 'conversation.message.ready',
      resourceRefs: [
        { resourceType: 'Conversation', resourceId: 'conversation_demo001' },
        {
          resourceType: 'ConversationMessage',
          resourceId: 'conversation_message_demo001',
        },
      ],
      facts: { status: 'ready' },
    });

    await expect(service.receive(event, event.eventId, event.traceId))
      .resolves.toMatchObject({ status: 'accepted' });
  });

  it('rejects stale schema versions and removed event types', async () => {
    const stale = behaviorEvent({ schemaVersion: '1.10.0' });
    await expect(service.receive(stale, stale.eventId, stale.traceId))
      .rejects.toMatchObject({ status: 400 });

    const removed = behaviorEvent({ eventType: 'coaching.complete' });
    await expect(service.receive(removed, removed.eventId, removed.traceId))
      .rejects.toMatchObject({ status: 400 });
  });

  it('keeps failed and non-profile facts as audit-only records', async () => {
    const failed = behaviorEvent({
      eventId: 'pbe_behavior_failed001',
      outcome: 'failed',
      facts: { errorCode: 'PROFILE_INCOMPLETE' },
    });
    const login = behaviorEvent({
      eventId: 'pbe_behavior_login001',
      eventType: 'auth.login',
      resourceRefs: [],
      facts: {},
    });
    await service.receive(failed, failed.eventId, failed.traceId);
    await service.receive(login, login.eventId, login.traceId);

    const rows = await dataSource.getRepository(PraxisBehaviorEventEntity)
      .find({ order: { eventId: 'ASC' } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.evidenceDisposition === 'audit_only'))
      .toBe(true);
    expect(rows.map((row) => row.evidenceReason).sort()).toEqual([
      'event_not_profile_relevant',
      'unsuccessful_outcome',
    ]);
  });
});
