import { describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { AuthService } from '../src/Network/modules/auth/auth.service.js';
import { CreateCareerAgentBaseline1785000000000 } from '../src/Network/migrations/1785000000000-CreateCareerAgentBaseline.js';
import { AddPublicUserId1785128058000 } from '../src/Network/migrations/1785128058000-AddPublicUserId.js';
import { careerAgentMigrations } from '../src/Network/migrations/migration-list.js';
import { resolveCareerAgentSecurityConfig } from '../src/Network/security.config.js';
import type { UserEntity } from '../src/Network/modules/user/entities/user.entity.js';
import { careerAgentEntities } from '../src/Network/database.config.js';
import { ApiSettingsEntity } from '../src/Network/modules/settings/entities/api-settings.entity.js';

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

function migrationDataSource(database: string) {
  return new DataSource({
    type: 'sqlite',
    database,
    entities: careerAgentEntities,
    migrations: careerAgentMigrations,
    migrationsTransactionMode: 'all',
    synchronize: false,
  });
}

describe('public user identity', () => {
  test('an empty production database is created entirely from migrations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'career-agent-baseline-'));
    const database = join(directory, 'career.sqlite');

    try {
      const dataSource = migrationDataSource(database);
      await dataSource.initialize();
      expect(await dataSource.runMigrations({ transaction: 'all' }))
        .toHaveLength(careerAgentMigrations.length);
      const tables = await dataSource.query(`
        SELECT "name"
        FROM "sqlite_master"
        WHERE "type" = 'table'
      `) as Array<{ name: string }>;
      const triggers = await dataSource.query(`
        SELECT "name"
        FROM "sqlite_master"
        WHERE "type" = 'trigger'
      `) as Array<{ name: string }>;
      const userColumns = await dataSource.query(
        'PRAGMA table_info("users")',
      ) as Array<{ name: string }>;
      const settingsRepo = dataSource.getRepository(ApiSettingsEntity);
      const savedSettings = await settingsRepo.save(settingsRepo.create({
        userId: 1001,
        provider: 'anthropic',
        model: 'test-model',
      }));
      expect(await settingsRepo.findOneByOrFail({ id: savedSettings.id }))
        .toMatchObject({
          userId: 1001,
          provider: 'anthropic',
          model: 'test-model',
        });
      for (const metadata of dataSource.entityMetadatas) {
        const columns = await dataSource.query(
          `PRAGMA table_info("${metadata.tableName}")`,
        ) as Array<{ name: string }>;
        const actual = new Set(columns.map(({ name }) => name));
        const missing = metadata.columns
          .map(({ databaseName }) => databaseName)
          .filter((name) => !actual.has(name));
        expect(missing, `${metadata.tableName} missing columns`).toEqual([]);
      }
      expect(await dataSource.runMigrations({ transaction: 'all' })).toHaveLength(0);
      await dataSource.destroy();
      const tableNames = new Set(tables.map(({ name }) => name));

      expect(tableNames.has('users')).toBe(true);
      expect(tableNames.has('conversations')).toBe(true);
      expect(tableNames.has('messages')).toBe(true);
      expect(tableNames.has('api_settings')).toBe(true);
      expect(tableNames.has('profile_suggestions')).toBe(true);
      expect(tableNames.has('career_profile_versions')).toBe(false);
      expect(tableNames.has('integration_outbox')).toBe(true);
      expect(userColumns.some(({ name }) => name === 'profileVersion'))
        .toBe(false);
      expect(userColumns.some(
        ({ name }) => name === 'currentProfileVersionId',
      )).toBe(false);
      expect(triggers.map(({ name }) => name)).toContain(
        'TRG_users_publicUserId_immutable',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('baseline initialization rejects a partially initialized database', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'career-agent-partial-'));
    const database = join(directory, 'career.sqlite');

    try {
      const dataSource = migrationDataSource(database);
      await dataSource.initialize();
      await dataSource.query('CREATE TABLE "orphaned_domain_table" ("id" integer)');
      await expect(dataSource.runMigrations({ transaction: 'all' }))
        .rejects.toThrow('unsupported partially initialized Career database');
      await dataSource.destroy();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('baseline migration rejects a users-only partial database', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'career-agent-unknown-'));
    const database = join(directory, 'career.sqlite');
    const dataSource = migrationDataSource(database);

    try {
      await dataSource.initialize();
      await dataSource.query(
        `CREATE TABLE "users" (
          "id" integer PRIMARY KEY,
          "profileJson" text NOT NULL DEFAULT ('{}'),
          "tokenVersion" integer NOT NULL DEFAULT (0),
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
        )`,
      );
      await expect(dataSource.runMigrations({ transaction: 'all' }))
        .rejects.toThrow('missing tables');
    } finally {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('baseline migration rejects unknown tables beside a complete legacy schema', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'career-agent-unknown-'));
    const database = join(directory, 'career.sqlite');
    const seed = new DataSource({ type: 'sqlite', database });
    const dataSource = migrationDataSource(database);

    try {
      await seed.initialize();
      const queryRunner = seed.createQueryRunner();
      await new CreateCareerAgentBaseline1785000000000().up(queryRunner);
      await queryRunner.query(
        'CREATE TABLE "foreign_business_data" ("id" integer PRIMARY KEY)',
      );
      await queryRunner.release();
      await seed.destroy();

      await dataSource.initialize();
      await expect(dataSource.runMigrations({ transaction: 'all' }))
        .rejects.toThrow('unknown tables: foreign_business_data');
    } finally {
      if (seed.isInitialized) {
        await seed.destroy();
      }
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('schema alignment adds provider to an existing settings table', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'career-agent-provider-'));
    const database = join(directory, 'career.sqlite');
    const seed = new DataSource({ type: 'sqlite', database });
    const dataSource = migrationDataSource(database);

    try {
      await seed.initialize();
      const queryRunner = seed.createQueryRunner();
      await new CreateCareerAgentBaseline1785000000000().up(queryRunner);
      await queryRunner.dropColumn('api_settings', 'provider');
      await queryRunner.release();
      await seed.destroy();

      await dataSource.initialize();
      await dataSource.runMigrations({ transaction: 'all' });
      const settingsRepo = dataSource.getRepository(ApiSettingsEntity);
      const setting = await settingsRepo.save(settingsRepo.create({
        userId: 2002,
        model: 'legacy-model',
      }));

      expect(await settingsRepo.findOneByOrFail({ id: setting.id }))
        .toMatchObject({
          userId: 2002,
          provider: 'anthropic',
          model: 'legacy-model',
        });
    } finally {
      if (seed.isInitialized) {
        await seed.destroy();
      }
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('profile backfill failure rolls back the complete pending migration batch', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'career-agent-rollback-'));
    const database = join(directory, 'career.sqlite');
    const baselineSource = new DataSource({
      type: 'sqlite',
      database,
      migrations: careerAgentMigrations.slice(0, 7),
      migrationsTransactionMode: 'all',
    });
    const dataSource = migrationDataSource(database);

    try {
      await baselineSource.initialize();
      await baselineSource.runMigrations({ transaction: 'all' });
      await baselineSource.query(`
        INSERT INTO "users" (
          "email",
          "profileJson",
          "tokenVersion",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          'corrupt-profile@example.test',
          '{invalid-json',
          0,
          datetime('now'),
          datetime('now')
        )
      `);
      await baselineSource.destroy();

      await dataSource.initialize();
      await expect(dataSource.runMigrations({ transaction: 'all' }))
        .rejects.toThrow('profileJson contains invalid JSON');
      const columns = await dataSource.query(
        'PRAGMA table_info("users")',
      ) as Array<{ name: string }>;
      const [{ count }] = await dataSource.query(
        'SELECT count(*) AS count FROM "migrations"',
      ) as Array<{ count: number }>;

      expect(columns.some(({ name }) => name === 'publicUserId')).toBe(false);
      expect(Number(count)).toBe(7);
      const versionTables = await dataSource.query(`
        SELECT "name"
        FROM "sqlite_master"
        WHERE "type" = 'table'
          AND "name" = 'career_profile_versions'
      `) as Array<{ name: string }>;
      expect(versionTables).toHaveLength(0);
    } finally {
      if (baselineSource.isInitialized) {
        await baselineSource.destroy();
      }
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('production rejects missing or weak authentication secrets', () => {
    expect(() => resolveCareerAgentSecurityConfig({
      NODE_ENV: 'production',
    })).toThrow('must be configured in production');
    expect(() => resolveCareerAgentSecurityConfig({
      NODE_ENV: 'production',
      CAREER_AGENT_JWT_SECRET: 'too-short',
    })).toThrow('at least 32 characters');
    expect(resolveCareerAgentSecurityConfig({
      NODE_ENV: 'production',
      CAREER_AGENT_JWT_SECRET: 'a-secure-production-secret-with-32-characters',
    }).jwtSecret).toBe('a-secure-production-secret-with-32-characters');
  });

  test('registration exposes an opaque UUID and uses it as the JWT subject', async () => {
    const repository = new InMemoryUserRepository();
    const service = new AuthService(repository as never, undefined as never);

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
    const directory = await mkdtemp(join(tmpdir(), 'career-agent-public-id-'));
    const dataSource = new DataSource({
      type: 'sqlite',
      database: join(directory, 'career.sqlite'),
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
    await rm(directory, { recursive: true, force: true });

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
    const service = new AuthService(repository as never, undefined as never);
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
