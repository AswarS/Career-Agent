import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { ProfileExternalSnapshotService } from '../profile/profile-external-snapshot.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PraxisIntegrationService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly snapshots: ProfileExternalSnapshotService,
  ) {}

  async getAccount(externalUserId: string) {
    const user = await this.requireUser(externalUserId);
    return this.accountView(user);
  }

  async getProfile(externalUserId: string) {
    const user = await this.requireUser(externalUserId);
    if (user.accountStatus !== 'active') {
      throw new ForbiddenException({
        code: 'ACCOUNT_DISABLED',
        message: 'Account is disabled.',
      });
    }
    const snapshot = await this.snapshots.getCurrentSnapshot(user.id);
    return {
      ...snapshot,
      profileVersion: this.version(Number(snapshot.profileVersion)),
    };
  }

  async searchDirectory(query: string, cursor?: string, requestedLimit?: string) {
    const keyword = query?.trim();
    if (!keyword || keyword.length > 100) {
      throw new BadRequestException({
        code: 'REQUEST_INVALID',
        message: 'query must contain between 1 and 100 characters.',
      });
    }
    const limit = requestedLimit === undefined ? 50 : Number(requestedLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new BadRequestException({
        code: 'REQUEST_INVALID',
        message: 'limit must be an integer between 1 and 50.',
      });
    }
    const after = cursor ? this.decodeCursor(cursor) : undefined;
    const escaped = keyword.toLowerCase().replace(/[\\%_]/g, '\\$&');
    const builder = this.userRepo.createQueryBuilder('user')
      .where('user.accountStatus = :status', { status: 'active' })
      .andWhere(
        "LOWER(COALESCE(user.displayName, '')) LIKE :query ESCAPE '\\'",
        { query: `%${escaped}%` },
      )
      .orderBy('user.publicUserId', 'ASC')
      .take(limit + 1);
    if (after) {
      builder.andWhere('user.publicUserId > :after', { after });
    }
    const users = await builder.getMany();
    const hasMore = users.length > limit;
    const page = users.slice(0, limit);
    return {
      items: page.map((user) => ({
        externalUserId: user.publicUserId,
        displayName: this.displayName(user),
        avatarUrl: user.avatarUrl ?? null,
        accountStatus: user.accountStatus,
      })),
      nextCursor: hasMore
        ? Buffer.from(JSON.stringify({
            v: 1,
            after: page.at(-1)!.publicUserId,
          })).toString('base64url')
        : null,
    };
  }

  private async requireUser(externalUserId: string) {
    const normalized = externalUserId.trim().toLowerCase();
    if (!UUID_PATTERN.test(normalized)) {
      throw new BadRequestException({
        code: 'REQUEST_INVALID',
        message: 'externalUserId must be a UUID.',
      });
    }
    const user = await this.userRepo.findOne({
      where: { publicUserId: normalized },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Account is unavailable.',
      });
    }
    return user;
  }

  private accountView(user: UserEntity) {
    return {
      externalUserId: user.publicUserId,
      displayName: this.displayName(user),
      avatarUrl: user.avatarUrl ?? null,
      accountStatus: user.accountStatus,
      sourceVersion: this.version(user.accountVersion),
      occurredAt: user.updatedAt.toISOString(),
    };
  }

  private displayName(user: UserEntity) {
    return user.displayName?.trim()
      || user.username?.trim()
      || user.email?.split('@', 1)[0]?.trim()
      || '用户';
  }

  private version(value: number) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('source version is outside the supported range');
    }
    return String(value).padStart(20, '0');
  }

  private decodeCursor(cursor: string) {
    try {
      const value = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { v?: unknown; after?: unknown };
      if (value.v !== 1 || typeof value.after !== 'string'
        || !UUID_PATTERN.test(value.after)) {
        throw new Error('invalid cursor');
      }
      return value.after.toLowerCase();
    } catch {
      throw new BadRequestException({
        code: 'REQUEST_INVALID',
        message: 'cursor is invalid.',
      });
    }
  }
}
