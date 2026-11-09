import { describe, expect, it } from 'vitest';
import { createRegisterRequest, normalizeAuthSession } from './authClient';

describe('authClient public identity', () => {
  it('prefers publicUserId over legacy and internal identifiers', () => {
    const session = normalizeAuthSession({
      user: {
        id: 12,
        userId: 12,
        publicUserId: '7fd26773-825b-4c62-a168-4d170437fefe',
        email: 'user@example.test',
        displayName: 'Career User',
      },
      accessToken: 'access-token',
    });

    expect(session.user.id).toBe('7fd26773-825b-4c62-a168-4d170437fefe');
  });

  it('accepts the snake_case public identity returned by other services', () => {
    const session = normalizeAuthSession({
      user: {
        id: 12,
        public_user_id: '5886c090-790a-4c04-83e4-cbbd52fa3fa4',
        display_name: 'Career User',
      },
    });

    expect(session.user.id).toBe('5886c090-790a-4c04-83e4-cbbd52fa3fa4');
  });
});

describe('authClient registration request', () => {
  it('keeps the password as a top-level string', () => {
    expect(createRegisterRequest({
      displayName: ' Career User ',
      email: ' user@example.test ',
      username: '',
      password: 'Password-2026!',
    })).toEqual({
      display_name: 'Career User',
      email: 'user@example.test',
      username: undefined,
      password: 'Password-2026!',
    });
  });

  it('rejects a missing password before making the request', () => {
    expect(() => createRegisterRequest({
      displayName: 'Career User',
      email: 'user@example.test',
      password: undefined as unknown as string,
    })).toThrow('密码格式无效，请重新输入。');
  });

  it('rejects a password shorter than eight characters', () => {
    expect(() => createRegisterRequest({
      displayName: 'Career User',
      username: 'career-user',
      password: 'short',
    })).toThrow('密码至少需要 8 位。');
  });
});
