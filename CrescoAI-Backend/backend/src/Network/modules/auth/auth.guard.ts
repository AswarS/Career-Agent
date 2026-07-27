import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import { IS_PUBLIC_ROUTE } from './public.decorator';
import { verifyFileDownloadToken } from '../../utils/fileDownloadToken.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic || !this.isCareerAgentRequest(request)) {
      return true;
    }

    if (this.isAuthDisabled()) {
      const userId = this.getSkipAuthUserId();
      request.user = { id: String(userId) };
      request.userId = userId;
      return true;
    }

    const token = this.getBearerToken(request.headers.authorization);
    if (!token) {
      const downloadUser = this.getDownloadTokenUser(request);
      if (downloadUser) {
        request.user = {
          id: String(downloadUser.userId),
          internalUserId: downloadUser.userId,
        };
        request.userId = downloadUser.userId;
        return true;
      }

      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'authorization bearer token is required',
      });
    }

    request.user = await this.authService.verifyAccessToken(token);
    // Controllers and database relations continue to use the internal integer.
    request.userId = request.user.internalUserId;
    return true;
  }

  private isCareerAgentRequest(request: AuthenticatedRequest) {
    const path = request.path ?? request.url ?? '';
    return path.startsWith('/api/career-agent');
  }

  private getBearerToken(authorization?: string) {
    const [scheme, token] = authorization?.split(' ') ?? [];

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return undefined;
    }

    return token;
  }

  private isAuthDisabled() {
    const value = process.env.CAREER_AGENT_SKIP_AUTH?.trim().toLowerCase();
    return value === '1' || value === 'true' || value === 'yes' || value === 'on';
  }

  private getSkipAuthUserId() {
    const userId = Number(process.env.CAREER_AGENT_SKIP_AUTH_USER_ID ?? 1);
    return Number.isInteger(userId) && userId > 0 ? userId : 1;
  }

  private getDownloadTokenUser(request: AuthenticatedRequest) {
    if (request.method?.toUpperCase() !== 'GET') {
      return undefined;
    }

    const path = request.path ?? request.url?.split('?', 1)[0] ?? '';
    const match = path.match(/^\/api\/career-agent\/threads\/([^/]+)\/files\/([^/]+)$/);
    if (!match) {
      return undefined;
    }

    const token = this.getQueryValue(request.query?.download_token ?? request.query?.token);
    if (!token) {
      return undefined;
    }

    const conversationId = decodeURIComponent(match[1]);
    const fileName = decodeURIComponent(match[2]);
    return verifyFileDownloadToken(token, { conversationId, fileName });
  }

  private getQueryValue(value: unknown) {
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0];
    }
    return undefined;
  }
}
