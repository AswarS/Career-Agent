import { describe, expect, test } from 'bun:test';
import { AuthService } from '../src/Network/modules/auth/auth.service.js';
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

  async find() {
    return this.users.filter((user) => !user.publicUserId);
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

  test('startup backfills existing users without changing their internal id', async () => {
    const repository = new InMemoryUserRepository();
    const legacyUser = await repository.save({
      id: 41,
      email: 'legacy@example.test',
      displayName: 'Legacy User',
      profileJson: '{}',
      tokenVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserEntity);
    const service = new AuthService(repository as never);

    await service.onModuleInit();

    expect(legacyUser.id).toBe(41);
    expect(UUID_PATTERN.test(legacyUser.publicUserId!)).toBe(true);
  });

  test('tokens with a legacy numeric subject remain valid during migration', async () => {
    const repository = new InMemoryUserRepository();
    const user = await repository.save({
      id: 7,
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
