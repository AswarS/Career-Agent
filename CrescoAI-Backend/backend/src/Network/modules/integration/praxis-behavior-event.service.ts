import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { hashCanonicalProfile, serializeCanonicalProfile } from '../profile/profile-version.utils';
import { UserEntity } from '../user/entities/user.entity';
import { PraxisBehaviorEventEntity } from './entities/praxis-behavior-event.entity';
import { classifyPraxisBehaviorEvidence } from './praxis-behavior-evidence.policy';
import { validatePraxisBehaviorEvent } from './praxis-behavior-event.validation';

@Injectable()
export class PraxisBehaviorEventService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(PraxisBehaviorEventEntity)
    private readonly events: Repository<PraxisBehaviorEventEntity>,
  ) {}

  async receive(
    input: unknown,
    idempotencyKey: string | undefined,
    requestTraceId: string | undefined,
  ) {
    const event = validatePraxisBehaviorEvent(input);
    if (!idempotencyKey || idempotencyKey !== event.eventId) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Idempotency-Key must equal eventId.',
      });
    }
    if (!requestTraceId || requestTraceId !== event.traceId) {
      throw new BadRequestException({
        code: 'TRACE_ID_MISMATCH',
        message: 'X-Trace-Id must equal the event traceId.',
      });
    }

    const payloadJson = serializeCanonicalProfile(event);
    const payloadHash = hashCanonicalProfile(payloadJson);
    const prior = await this.events.findOne({ where: { eventId: event.eventId } });
    if (prior) return this.acknowledgePrior(prior, payloadHash, event.traceId);

    try {
      await this.dataSource.transaction(async (manager) => {
        const user = await manager.findOne(UserEntity, {
          where: { publicUserId: event.externalUserId.toLowerCase() },
        });
        if (!user) {
          throw new NotFoundException({
            code: 'ACCOUNT_NOT_FOUND',
            message: 'Account is unavailable.',
          });
        }
        const decision = classifyPraxisBehaviorEvidence(event);
        await manager.insert(PraxisBehaviorEventEntity, {
          eventId: event.eventId,
          userId: user.id,
          schemaVersion: event.schemaVersion,
          eventType: event.eventType,
          actorType: event.actorType,
          occurredAt: new Date(event.occurredAt),
          traceId: event.traceId,
          sourceEventId: event.sourceEventId ?? null,
          outcome: event.outcome,
          resourceRefsJson: serializeCanonicalProfile(event.resourceRefs),
          factsJson: serializeCanonicalProfile(event.facts),
          payloadJson,
          payloadHash,
          evidenceDisposition: decision.disposition,
          evidenceCategory: decision.category,
          evidenceReason: decision.reason,
        });
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      const concurrent = await this.events.findOne({
        where: { eventId: event.eventId },
      });
      if (concurrent) {
        return this.acknowledgePrior(concurrent, payloadHash, event.traceId);
      }
      throw error;
    }

    return { eventId: event.eventId, status: 'accepted', traceId: event.traceId };
  }

  private acknowledgePrior(
    prior: PraxisBehaviorEventEntity,
    payloadHash: string,
    traceId: string,
  ) {
    if (prior.payloadHash !== payloadHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'eventId was already used for a different behavior event.',
      });
    }
    return { eventId: prior.eventId, status: 'duplicate', traceId };
  }
}
