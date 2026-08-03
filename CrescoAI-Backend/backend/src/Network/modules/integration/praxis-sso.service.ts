import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, sign } from 'node:crypto';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { resolvePraxisIntegrationConfig } from './praxis-integration.config';

@Injectable()
export class PraxisSsoService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async issueTicket(userId: number) {
    const config = resolvePraxisIntegrationConfig();
    if (!config.enabled) {
      throw new ServiceUnavailableException('Praxis integration is disabled');
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.accountStatus !== 'active') {
      throw new ServiceUnavailableException('active account is unavailable');
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + 60;
    const header = this.encode({
      alg: config.ssoAlgorithm,
      typ: 'JWT',
      kid: config.activeSsoKid,
    });
    const payload = this.encode({
      iss: config.issuer,
      aud: config.audience,
      sub: user.publicUserId,
      jti: randomBytes(16).toString('base64url'),
      iat: issuedAt,
      exp: expiresAt,
    });
    const signingInput = `${header}.${payload}`;
    const signature = sign('sha256', Buffer.from(signingInput), {
      key: config.ssoPrivateKey,
      dsaEncoding: config.ssoAlgorithm === 'ES256'
        ? 'ieee-p1363'
        : undefined,
    }).toString('base64url');

    return {
      ticket: `${signingInput}.${signature}`,
      targetUrl: `${config.praxisBaseUrl}/api/v1/auth/sso`,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  jwks() {
    const config = resolvePraxisIntegrationConfig();
    if (!config.enabled) {
      throw new ServiceUnavailableException('Praxis integration is disabled');
    }
    return {
      keys: Object.entries(config.ssoVerificationKeys)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([kid, publicKey]) => ({
          ...publicKey.export({ format: 'jwk' }),
          kid,
          use: 'sig',
          alg: config.ssoAlgorithm,
        })),
    };
  }

  private encode(value: unknown) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }
}
