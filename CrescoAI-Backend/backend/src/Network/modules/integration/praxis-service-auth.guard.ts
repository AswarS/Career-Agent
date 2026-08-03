import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { resolvePraxisIntegrationConfig } from './praxis-integration.config';

@Injectable()
export class PraxisServiceAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const config = resolvePraxisIntegrationConfig();
    if (!config.enabled) {
      throw new ServiceUnavailableException('Praxis integration is disabled');
    }
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
    }>();
    const [scheme, credential] = request.headers.authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !credential) {
      throw new UnauthorizedException('Praxis service credential is required');
    }
    const separator = credential.indexOf('.');
    if (separator < 1) {
      throw new UnauthorizedException('Praxis service credential is invalid');
    }
    const kid = credential.slice(0, separator);
    const suppliedSecret = credential.slice(separator + 1);
    const expectedSecret = config.serviceCredentials[kid];
    if (!expectedSecret || !this.equal(suppliedSecret, expectedSecret)) {
      throw new UnauthorizedException('Praxis service credential is invalid');
    }
    return true;
  }

  private equal(left: string, right: string) {
    const leftHash = createHash('sha256').update(left).digest();
    const rightHash = createHash('sha256').update(right).digest();
    return timingSafeEqual(leftHash, rightHash);
  }
}
