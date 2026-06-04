import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  username?: string;
  display_name?: string;
  displayName?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  userId?: number;
}
