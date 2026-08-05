export const PRAXIS_SSO_ENTRY_PATH = '/sso/praxis';

export function resolvePostAuthRedirect(value: unknown) {
  if (typeof value !== 'string') return '/';
  const candidate = value.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return '/';
  }

  try {
    const url = new URL(candidate, 'https://career.invalid');
    if (url.origin !== 'https://career.invalid') return '/';
    if (url.pathname === '/auth' || url.pathname.startsWith('/auth/')) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

export interface AuthNavigationInput {
  isAuthenticated: boolean;
  isPublic: boolean;
  fullPath: string;
  redirect: unknown;
}

export function resolveAuthNavigation(input: AuthNavigationInput) {
  if (input.isPublic) {
    return input.isAuthenticated
      ? resolvePostAuthRedirect(input.redirect)
      : true;
  }

  if (!input.isAuthenticated) {
    return {
      name: 'auth',
      query: { redirect: input.fullPath },
    } as const;
  }

  return true;
}
