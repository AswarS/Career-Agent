import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { IntegrationOutboxEntity } from './entities/integration-outbox.entity';
import { resolvePraxisIntegrationConfig } from './praxis-integration.config';

const RETRY_SECONDS = [10, 60, 300, 1_800, 7_200];
const MAX_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 60_000;

@Injectable()
export class PraxisOutboxPublisherService
implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PraxisOutboxPublisherService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(IntegrationOutboxEntity)
    private readonly outboxRepo: Repository<IntegrationOutboxEntity>,
  ) {}

  onApplicationBootstrap() {
    if (!resolvePraxisIntegrationConfig().enabled) return;
    this.timer = setInterval(() => void this.publishAvailable(), 5_000);
    this.timer.unref?.();
    void this.publishAvailable();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async publishAvailable(maximum = 25) {
    if (this.running) return 0;
    this.running = true;
    let published = 0;
    try {
      for (let index = 0; index < maximum; index += 1) {
        const claimed = await this.claimNext();
        if (!claimed) break;
        if (await this.publish(claimed)) published += 1;
      }
      return published;
    } finally {
      this.running = false;
    }
  }

  private async claimNext() {
    const now = new Date();
    const expired = new Date(now.getTime() - LEASE_MS);
    const lockToken = randomUUID();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    let began = false;
    let id: string | undefined;
    try {
      // SQLite has no row-level locks. BEGIN IMMEDIATE serializes the short
      // select-and-claim section across application instances.
      await queryRunner.query('BEGIN IMMEDIATE TRANSACTION');
      began = true;
      await queryRunner.query(
        `UPDATE "integration_outbox"
         SET "status" = 'pending', "lockToken" = NULL, "lockedAt" = NULL
         WHERE "status" = 'publishing'
           AND julianday("lockedAt") <= julianday(?)`,
        [expired.toISOString()],
      );
      const rows = await queryRunner.query(
        `SELECT "id" FROM "integration_outbox"
         WHERE "status" = 'pending'
           AND ("availableAt" IS NULL
             OR julianday("availableAt") <= julianday(?))
         ORDER BY julianday("availableAt") ASC, julianday("createdAt") ASC
         LIMIT 1`,
        [now.toISOString()],
      ) as Array<{ id: string }>;
      id = rows[0]?.id;
      if (id) {
        await queryRunner.query(
          `UPDATE "integration_outbox"
           SET "status" = 'publishing',
               "lockToken" = ?,
               "lockedAt" = ?,
               "attempts" = "attempts" + 1
           WHERE "id" = ? AND "status" = 'pending'`,
          [lockToken, now.toISOString(), id],
        );
      }
      await queryRunner.query('COMMIT');
      began = false;
    } catch (error) {
      if (began) await queryRunner.query('ROLLBACK');
      throw error;
    } finally {
      await queryRunner.release();
    }
    if (!id) return null;
    return this.outboxRepo.findOne({ where: { id, lockToken } });
  }

  private async publish(message: IntegrationOutboxEntity) {
    const config = resolvePraxisIntegrationConfig();
    const secret = config.eventSigningKeys[config.activeEventSigningKid];
    if (!secret) {
      await this.fail(message, 'active event signing key is unavailable');
      return false;
    }
    let payload: { eventId?: unknown };
    try {
      payload = JSON.parse(message.payloadJson) as { eventId?: unknown };
    } catch {
      await this.fail(message, 'outbox payload is not valid JSON');
      return false;
    }
    if (payload.eventId !== message.id) {
      await this.fail(message, 'outbox eventId does not match its idempotency key');
      return false;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}\n${message.id}\n${message.payloadJson}`)
      .digest('base64url');
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 10_000);
    try {
      const response = await fetch(
        `${config.praxisBaseUrl}/api/v1/internal/account-events`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': message.id,
            'X-Trace-Id': `trace_${message.id}`,
            'X-Service-Signature':
              `v1;kid=${config.activeEventSigningKid};t=${timestamp};sig=${signature}`,
          },
          body: message.payloadJson,
          signal: abort.signal,
        },
      );
      if (response.status === 202) {
        await this.outboxRepo.update(
          { id: message.id, lockToken: message.lockToken },
          {
            status: 'published',
            publishedAt: new Date(),
            lockToken: null,
            lockedAt: null,
            lastError: null,
          },
        );
        return true;
      }
      const detail = `Praxis returned HTTP ${response.status}`;
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = this.retryAfterSeconds(response.headers.get('retry-after'));
        await this.retry(message, detail, retryAfter);
      } else {
        await this.fail(message, detail);
      }
      return false;
    } catch (error) {
      await this.retry(
        message,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async retry(
    message: IntegrationOutboxEntity,
    error: string,
    retryAfter?: number,
  ) {
    const now = new Date();
    if (now.getTime() - message.createdAt.getTime() >= MAX_RETRY_WINDOW_MS) {
      await this.fail(message, `retry window expired: ${error}`);
      return;
    }
    const scheduled = RETRY_SECONDS[
      Math.min(Math.max(message.attempts - 1, 0), RETRY_SECONDS.length - 1)
    ];
    const delay = retryAfter ?? scheduled;
    await this.outboxRepo.update(
      { id: message.id, lockToken: message.lockToken },
      {
        status: 'pending',
        availableAt: new Date(now.getTime() + delay * 1000),
        lockToken: null,
        lockedAt: null,
        lastError: error.slice(0, 2_000),
      },
    );
  }

  private async fail(message: IntegrationOutboxEntity, error: string) {
    this.logger.error(`Praxis event ${message.id} failed: ${error}`);
    await this.outboxRepo.update(
      { id: message.id, lockToken: message.lockToken },
      {
        status: 'failed',
        lockToken: null,
        lockedAt: null,
        lastError: error.slice(0, 2_000),
      },
    );
  }

  private retryAfterSeconds(value: string | null) {
    if (!value) return undefined;
    const seconds = Number(value);
    return Number.isInteger(seconds) && seconds >= 1 && seconds <= 7_200
      ? seconds
      : undefined;
  }
}
