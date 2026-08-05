import { describe, expect, it } from 'vitest';
import {
  PRAXIS_SSO_ENTRY_PATH,
  resolveAuthNavigation,
  resolvePostAuthRedirect,
} from './authNavigation';

describe('authentication navigation', () => {
  it('preserves the fixed Praxis entry while sending an anonymous user to login', () => {
    expect(resolveAuthNavigation({
      isAuthenticated: false,
      isPublic: false,
      fullPath: PRAXIS_SSO_ENTRY_PATH,
      redirect: undefined,
    })).toEqual({
      name: 'auth',
      query: { redirect: '/sso/praxis' },
    });
  });

  it('restores the Praxis entry for an authenticated user on the login route', () => {
    expect(resolveAuthNavigation({
      isAuthenticated: true,
      isPublic: true,
      fullPath: '/auth?redirect=/sso/praxis',
      redirect: PRAXIS_SSO_ENTRY_PATH,
    })).toBe(PRAXIS_SSO_ENTRY_PATH);
  });

  it.each([
    'https://evil.example/sso',
    '//evil.example/sso',
    '/auth',
    '/auth?redirect=/sso/praxis',
    '\\evil.example',
  ])('rejects unsafe or recursive post-auth redirect %s', (redirect) => {
    expect(resolvePostAuthRedirect(redirect)).toBe('/');
  });

  it('keeps a valid internal path with its query and fragment', () => {
    expect(resolvePostAuthRedirect('/sso/praxis?source=praxis#continue'))
      .toBe('/sso/praxis?source=praxis#continue');
  });
});
