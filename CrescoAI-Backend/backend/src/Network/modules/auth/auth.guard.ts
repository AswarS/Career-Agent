import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import { IS_PUBLIC_ROUTE } from './public.decorator';

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

    const token = this.getBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'authorization bearer token is required',
      });
    }

    request.user = await this.authService.verifyAccessToken(token);
    // Also set req.userId (number) for controllers that use this pattern
    request.userId = Number(request.user.id);
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
}
