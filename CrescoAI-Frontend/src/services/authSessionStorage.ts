import type { AuthSession } from '../types/entities';

const AUTH_SESSION_STORAGE_KEY = 'career-agent-auth-session';

function getLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AuthSession>;
  return Boolean(
    candidate.user
    && typeof candidate.user === 'object'
    && typeof candidate.user.id === 'string'
    && ('email' in candidate.user ? typeof candidate.user.email === 'string' || candidate.user.email === null : true)
    && ('username' in candidate.user ? typeof candidate.user.username === 'string' || candidate.user.username === null : true)
    && typeof candidate.user.displayName === 'string'
    && ('accessToken' in candidate ? typeof candidate.accessToken === 'string' || candidate.accessToken === null : true)
    && ('refreshToken' in candidate ? typeof candidate.refreshToken === 'string' || candidate.refreshToken === null : true)
    && ('tokenType' in candidate ? typeof candidate.tokenType === 'string' : true)
    && ('expiresAt' in candidate ? typeof candidate.expiresAt === 'string' || candidate.expiresAt === null : true)
    && ('expiresIn' in candidate ? typeof candidate.expiresIn === 'number' || candidate.expiresIn === null : true),
  );
}

function normalizeStoredAuthSession(session: AuthSession): AuthSession {
  return {
    user: {
      id: session.user.id,
      email: 'email' in session.user ? session.user.email : null,
      username: 'username' in session.user ? session.user.username : null,
      displayName: session.user.displayName,
    },
    accessToken: 'accessToken' in session ? session.accessToken : null,
    refreshToken: 'refreshToken' in session ? session.refreshToken : null,
    tokenType: 'tokenType' in session && session.tokenType ? session.tokenType : 'Bearer',
    expiresAt: 'expiresAt' in session ? session.expiresAt : null,
    expiresIn: 'expiresIn' in session ? session.expiresIn : null,
  };
}

export function readStoredAuthSession(): AuthSession | null {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return null;
  }

  let rawSession: string | null;

  try {
    rawSession = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(rawSession);
    return isAuthSession(parsedSession) ? normalizeStoredAuthSession(parsedSession) : null;
  } catch {
    return null;
  }
}

export function writeStoredAuthSession(session: AuthSession | null) {
  const localStorage = getLocalStorage();

  if (!localStorage) {
    return;
  }

  try {
    if (!session) {
      localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return;
    }

    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Treat storage as best-effort so auth flows still work in restricted browsers.
  }
}

export function readStoredAuthToken() {
  return readStoredAuthSession()?.accessToken ?? null;
}

export function readStoredAuthTokenType() {
  return readStoredAuthSession()?.tokenType ?? 'Bearer';
}

export function readStoredAuthUserId() {
  return readStoredAuthSession()?.user.id ?? null;
}
