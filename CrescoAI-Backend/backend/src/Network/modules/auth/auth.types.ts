import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  publicUserId?: string;
  public_user_id?: string;
  /** Internal-only database key populated by the authentication guard. */
  internalUserId?: number;
  email?: string;
  username?: string;
  display_name?: string;
  displayName?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  userId?: number;
}
