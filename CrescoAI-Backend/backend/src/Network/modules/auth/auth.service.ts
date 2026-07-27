import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomBytes, randomUUID, scrypt as scryptCallback, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { createDefaultProfile } from '../profile/profile.types';
import { careerAgentJwtSecret } from '../../security.config.js';
import { serializeCanonicalProfile } from '../profile/profile-version.utils.js';
import { BaseProfileEntity } from '../profile/entities/base-profile.entity.js';
import { ProfileProjectionJobEntity } from '../profile/entities/profile-projection-job.entity.js';
import { ProfileRevisionEntity } from '../profile/entities/profile-revision.entity.js';
import { ProfileStateEntity } from '../profile/entities/profile-state.entity.js';

const scrypt = promisify(scryptCallback);
interface AccessTokenPayload {
  sub: string;
  email?: string;
  username?: string;
  display_name?: string;
  token_version: number;
  typ: 'access';
  iat: number;
  exp: number;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async register(dto: RegisterDto) {
    const email = this.normalizeEmail(dto.email);
    const username = this.normalizeUsername(dto.username);

    if (!email && !username) {
      throw new BadRequestException(this.error('AUTH_VALIDATION_FAILED', 'email or username is required'));
    }

    const existing = await this.findExistingUser(email, username);
    if (existing) {
      throw new ConflictException(this.error('USER_ALREADY_EXISTS', 'email or username already exists'));
    }

    const displayName = this.normalizeDisplayName(dto.display_name ?? dto.displayName, email, username);
    const passwordHash = await this.hashPassword(dto.password);
    const profileJson = serializeCanonicalProfile(
      createDefaultProfile(displayName),
    );
    const user = this.userRepo.create({
      userId: undefined,
      publicUserId: randomUUID(),
      email,
      username,
      displayName,
      passwordHash,
      profileJson,
      tokenVersion: 0,
      accountStatus: 'active',
      accountVersion: 1,
    });
    let saved: UserEntity | undefined;
    try {
      saved = await this.persistNewUser(user, displayName);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(this.error('USER_ALREADY_EXISTS', 'email or username already exists'));
      }

      throw error;
    }

    if (!saved) {
      throw new BadRequestException(this.error('AUTH_VALIDATION_FAILED', 'registration failed'));
    }

    return this.issueSession(saved);
  }

  async login(dto: LoginDto) {
    const email = this.normalizeEmail(dto.email);
    const username = this.normalizeUsername(dto.username);
    const identifier = dto.identifier?.trim();
    const user = await this.findLoginUser(email, username, identifier);

    if (!user?.passwordHash || !(await this.verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException(this.error('INVALID_CREDENTIALS', 'invalid email, username or password'));
    }
    this.assertAccountActive(user);

    return this.issueSession(user);
  }

  async refresh(dto: RefreshTokenDto) {
    const refreshToken = dto.refresh_token ?? dto.refreshToken;
    if (!refreshToken) {
      throw new BadRequestException(this.error('AUTH_VALIDATION_FAILED', 'refresh_token is required'));
    }

    const refreshTokenHash = this.hashOpaqueToken(refreshToken);
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect(['user.passwordHash', 'user.refreshTokenHash'])
      .where('user.refreshTokenHash = :refreshTokenHash', { refreshTokenHash })
      .getOne();

    if (!user?.refreshTokenExpiresAt || user.refreshTokenExpiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException(this.error('UNAUTHORIZED', 'refresh token is invalid or expired'));
    }
    this.assertAccountActive(user);

    return this.issueSession(user);
  }

  async logout(userId: string) {
    const user = await this.findUserBySubject(userId);
    if (user) {
      user.refreshTokenHash = null;
      user.refreshTokenExpiresAt = null;
      user.tokenVersion += 1;
      await this.userRepo.save(user);
    }

    return {};
  }

  async getSession(userId: string) {
    const user = await this.findUserBySubject(userId);
    if (!user) {
      throw new UnauthorizedException(this.error('UNAUTHORIZED', 'session is invalid'));
    }
    this.assertAccountActive(user);

    return {
      user: this.toAuthUser(user),
    };
  }

  async verifyAccessToken(token: string) {
    const payload = this.verifySignedToken(token);
    const user = await this.findUserBySubject(payload.sub);

    if (!user || user.tokenVersion !== payload.token_version) {
      throw new UnauthorizedException(this.error('UNAUTHORIZED', 'token is invalid or expired'));
    }
    this.assertAccountActive(user);

    return {
      ...this.toAuthUser(user),
      internalUserId: user.id,
    };
  }

  private async persistNewUser(user: UserEntity, displayName: string) {
    if (!this.dataSource) {
      const saved = await this.userRepo.save(user);
      saved.userId = String(saved.id);
      return this.userRepo.save(saved);
    }

    return this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const saved = await userRepo.save(user);
      const base = await manager.save(manager.create(BaseProfileEntity, {
        userId: saved.id,
        name: displayName,
        gender: '',
        birthDate: null,
        educationLevel: '',
        educationBackgroundJson: '[]',
        currentCity: '',
        currentStatus: '',
        currentRole: '',
        currentIndustry: '',
        yearsOfExperience: null,
        contactLanguage: '',
        version: 1,
      }));
      const state = await manager.save(manager.create(ProfileStateEntity, {
        userId: saved.id,
        aggregateVersion: 1,
        projectionVersion: 0,
        projectionStatus: 'pending',
        nextProfileIndex: 1,
      }));
      await manager.save(manager.create(ProfileRevisionEntity, {
        userId: saved.id,
        aggregateVersion: state.aggregateVersion,
        targetType: 'base_profile',
        targetId: String(base.id),
        operation: 'create',
        beforeJson: null,
        afterJson: JSON.stringify({
          name: base.name,
          currentCity: base.currentCity,
          currentRole: base.currentRole,
          currentStatus: base.currentStatus,
          educationBackgroundJson: base.educationBackgroundJson,
        }),
        sourceType: 'registration',
        updateLevel: 'L3',
        sourceConversationId: null,
        sourceMessageId: null,
        userConfirmed: true,
        actorType: 'user',
      }));
      await manager.save(manager.create(ProfileProjectionJobEntity, {
        userId: saved.id,
        targetVersion: state.aggregateVersion,
        status: 'pending',
        retryCount: 0,
        lastError: null,
      }));
      saved.userId = String(saved.id);
      return userRepo.save(saved);
    });
  }

  private async issueSession(user: UserEntity) {
    const now = Math.floor(Date.now() / 1000);
    const accessExpiresIn = this.accessTokenExpiresInSeconds();
    const refreshExpiresIn = this.refreshTokenExpiresInSeconds();
    const expiresAtDate = new Date((now + accessExpiresIn) * 1000);
    const payload: AccessTokenPayload = {
      sub: user.publicUserId!,
      email: user.email,
      username: user.username,
      display_name: user.displayName,
      token_version: user.tokenVersion,
      typ: 'access',
      iat: now,
      exp: now + accessExpiresIn,
    };
    const accessToken = this.signToken(payload);
    const refreshToken = `rt_${randomBytes(48).toString('base64url')}`;

    user.refreshTokenHash = this.hashOpaqueToken(refreshToken);
    user.refreshTokenExpiresAt = new Date((now + refreshExpiresIn) * 1000);
    await this.userRepo.save(user);

    return {
      user: this.toAuthUser(user),
      access_token: accessToken,
      accessToken,
      refresh_token: refreshToken,
      refreshToken,
      token_type: 'Bearer',
      tokenType: 'Bearer',
      expires_at: expiresAtDate.toISOString(),
      expiresAt: expiresAtDate.toISOString(),
      expires_in: accessExpiresIn,
      expiresIn: accessExpiresIn,
    };
  }

  private async findExistingUser(email?: string, username?: string) {
    const where = [];
    if (email) {
      where.push({ email });
    }
    if (username) {
      where.push({ username });
    }

    return where.length ? this.userRepo.findOne({ where }) : null;
  }

  private async findLoginUser(email?: string, username?: string, identifier?: string) {
    const normalizedIdentifier = identifier?.includes('@')
      ? this.normalizeEmail(identifier)
      : this.normalizeUsername(identifier);
    const where = [];

    if (email) {
      where.push({ email });
    }
    if (username) {
      where.push({ username });
    }
    if (normalizedIdentifier) {
      where.push(identifier?.includes('@') ? { email: normalizedIdentifier } : { username: normalizedIdentifier });
    }

    if (!where.length) {
      throw new BadRequestException(this.error('AUTH_VALIDATION_FAILED', 'email, username or identifier is required'));
    }

    const query = this.userRepo.createQueryBuilder('user').addSelect('user.passwordHash');
    const clauses: string[] = [];
    const params: Record<string, string> = {};

    where.forEach((condition, index) => {
      if ('email' in condition && condition.email) {
        const key = `email${index}`;
        clauses.push(`user.email = :${key}`);
        params[key] = condition.email;
      }
      if ('username' in condition && condition.username) {
        const key = `username${index}`;
        clauses.push(`user.username = :${key}`);
        params[key] = condition.username;
      }
    });

    return query.where(clauses.join(' OR '), params).getOne();
  }

  private async findUserBySubject(subject: string) {
    const normalizedSubject = subject?.trim();
    if (!normalizedSubject) {
      return null;
    }

    const byPublicId = await this.userRepo.findOne({
      where: { publicUserId: normalizedSubject },
    });
    if (byPublicId) {
      return byPublicId;
    }

    // Compatibility for access tokens issued before publicUserId existed.
    const legacyId = Number(normalizedSubject);
    if (!Number.isInteger(legacyId) || legacyId < 1) {
      return null;
    }
    return this.userRepo.findOne({ where: { id: legacyId } });
  }

  private async hashPassword(password: string) {
    const salt = randomBytes(16).toString('base64url');
    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt$${salt}$${derivedKey.toString('base64url')}`;
  }

  private async verifyPassword(password: string, passwordHash: string) {
    const [algorithm, salt, storedKey] = passwordHash.split('$');
    if (algorithm !== 'scrypt' || !salt || !storedKey) {
      return false;
    }

    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    const stored = Buffer.from(storedKey, 'base64url');

    return stored.length === derivedKey.length && timingSafeEqual(stored, derivedKey);
  }

  private signToken(payload: AccessTokenPayload) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = this.base64UrlJson(header);
    const encodedPayload = this.base64UrlJson(payload);
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private verifySignedToken(token: string): AccessTokenPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException(this.error('UNAUTHORIZED', 'token is invalid or expired'));
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);
    let signatureBuffer: Buffer;
    let expectedBuffer: Buffer;
    try {
      signatureBuffer = Buffer.from(signature, 'base64url');
      expectedBuffer = Buffer.from(expectedSignature, 'base64url');
    } catch {
      throw new UnauthorizedException(this.error('UNAUTHORIZED', 'token is invalid or expired'));
    }

    if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
      throw new UnauthorizedException(this.error('UNAUTHORIZED', 'token is invalid or expired'));
    }

    let payload: AccessTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AccessTokenPayload;
    } catch {
      throw new UnauthorizedException(this.error('UNAUTHORIZED', 'token is invalid or expired'));
    }
    if (payload.typ !== 'access' || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException(this.error('UNAUTHORIZED', 'token is invalid or expired'));
    }

    return payload;
  }

  private sign(value: string) {
    return createHmac('sha256', this.jwtSecret()).update(value).digest('base64url');
  }

  private base64UrlJson(value: unknown) {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  }

  private hashOpaqueToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private jwtSecret() {
    return careerAgentJwtSecret();
  }

  private accessTokenExpiresInSeconds() {
    return this.positiveNumber(process.env.CAREER_AGENT_ACCESS_TOKEN_SECONDS, 2 * 60 * 60);
  }

  private refreshTokenExpiresInSeconds() {
    return this.positiveNumber(process.env.CAREER_AGENT_REFRESH_TOKEN_SECONDS, 7 * 24 * 60 * 60);
  }

  private positiveNumber(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private normalizeEmail(email?: string) {
    const value = email?.trim().toLowerCase();
    return value || undefined;
  }

  private normalizeUsername(username?: string) {
    const value = username?.trim().toLowerCase();
    return value || undefined;
  }

  private normalizeDisplayName(displayName?: string, email?: string, username?: string) {
    const value = displayName?.trim();
    if (value) {
      return value;
    }

    return username ?? email?.split('@')[0] ?? '用户';
  }

  private toAuthUser(user: UserEntity) {
    const displayName = user.displayName ?? this.normalizeDisplayName(undefined, user.email, user.username);

    return {
      id: user.publicUserId!,
      publicUserId: user.publicUserId!,
      public_user_id: user.publicUserId!,
      email: user.email,
      username: user.username,
      display_name: displayName,
      displayName,
    };
  }

  private error(code: string, message: string) {
    return { code, message };
  }

  private assertAccountActive(user: UserEntity) {
    if (user.accountStatus === 'disabled') {
      throw new UnauthorizedException(
        this.error('ACCOUNT_DISABLED', 'account is disabled'),
      );
    }
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      String(error.message).toLowerCase().includes('unique')
    );
  }
}
