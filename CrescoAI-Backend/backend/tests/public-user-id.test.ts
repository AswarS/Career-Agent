import { describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuthService } from '../src/Network/modules/auth/auth.service.js';
import { AddPublicUserId1785128058000 } from '../src/Network/migrations/1785128058000-AddPublicUserId.js';
import type { UserEntity } from '../src/Network/modules/user/entities/user.entity.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class InMemoryUserRepository {
  users: UserEntity[] = [];
  nextId = 1;

  create(input: Partial<UserEntity>) {
    return { ...input } as UserEntity;
  }

  async save(user: UserEntity) {
    if (!user.id) {
      user.id = this.nextId++;
      user.createdAt = new Date();
    }
    user.updatedAt = new Date();
    const index = this.users.findIndex((candidate) => candidate.id === user.id);
    if (index >= 0) {
      this.users[index] = user;
    } else {
      this.users.push(user);
    }
    return user;
  }

  async findOne(options: { where: Partial<UserEntity> }) {
    const entries = Object.entries(options.where);
    return this.users.find((user) =>
      entries.every(([key, value]) => user[key as keyof UserEntity] === value),
    ) ?? null;
  }
}

function decodePayload(token: string) {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub: string;
  };
}

describe('public user identity', () => {
  test('registration exposes an opaque UUID and uses it as the JWT subject', async () => {
    const repository = new InMemoryUserRepository();
    const service = new AuthService(repository as never);

    const session = await service.register({
      email: 'public-id@example.test',
      password: 'PublicIdPass-2026!',
      display_name: 'Public ID User',
    });

    expect(UUID_PATTERN.test(session.user.id)).toBe(true);
    expect(session.user.publicUserId).toBe(session.user.id);
    expect(session.user.public_user_id).toBe(session.user.id);
    expect(decodePayload(session.access_token).sub).toBe(session.user.id);
    expect(session.user.id).not.toBe(String(repository.users[0].id));
  });

  test('migration atomically backfills unique UUIDs and makes the column required', async () => {
    const dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
    });
    await dataSource.initialize();
    await dataSource.query(`
      CREATE TABLE "users" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "email" varchar
      )
    `);
    await dataSource.query(`
      INSERT INTO "users" ("email")
      VALUES ('legacy-one@example.test'), ('legacy-two@example.test')
    `);

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.startTransaction();
    try {
      await new AddPublicUserId1785128058000().up(queryRunner);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    const rows = await dataSource.query(
      'SELECT "id", "publicUserId" FROM "users" ORDER BY "id"',
    );
    const columns = await dataSource.query('PRAGMA table_info("users")');
    const indexes = await dataSource.query('PRAGMA index_list("users")');
    let immutable = false;
    try {
      await dataSource.query(`
        UPDATE "users"
        SET "publicUserId" = '00000000-0000-4000-8000-000000000000'
        WHERE "id" = 1
      `);
    } catch {
      immutable = true;
    }
    await dataSource.destroy();

    expect(rows.map((row: { id: number }) => row.id)).toEqual([1, 2]);
    expect(rows.every((row: { publicUserId: string }) =>
      UUID_PATTERN.test(row.publicUserId))).toBe(true);
    expect(new Set(rows.map((row: { publicUserId: string }) =>
      row.publicUserId)).size).toBe(2);
    expect(columns.find((column: { name: string }) =>
      column.name === 'publicUserId')?.notnull).toBe(1);
    expect(indexes.some((index: { name: string; unique: number }) =>
      index.name === 'IDX_users_publicUserId_unique' && index.unique === 1)).toBe(true);
    expect(immutable).toBe(true);
  });

  test('tokens with a legacy numeric subject remain valid during migration', async () => {
    const repository = new InMemoryUserRepository();
    const user = await repository.save({
      id: 7,
      publicUserId: randomUUID(),
      email: 'legacy-token@example.test',
      displayName: 'Legacy Token User',
      profileJson: '{}',
      tokenVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserEntity);
    const service = new AuthService(repository as never);
    const now = Math.floor(Date.now() / 1000);
    const legacyToken = (service as any).signToken({
      sub: '7',
      token_version: 0,
      typ: 'access',
      iat: now,
      exp: now + 60,
    });

    const principal = await service.verifyAccessToken(legacyToken);

    expect(principal.internalUserId).toBe(7);
    expect(UUID_PATTERN.test(principal.id)).toBe(true);
    expect(user.publicUserId).toBe(principal.id);
  });
});
