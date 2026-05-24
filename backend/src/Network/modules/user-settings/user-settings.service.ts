import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { UpdateUsernameDto } from './dto/update-username.dto';
import { TestApiSettingDto } from './dto/test-api-setting.dto';
import { UpsertApiSettingDto } from './dto/upsert-api-setting.dto';
import { UserSettingEntity } from './entities/user-setting.entity';

export interface UserAgentConfig {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

const defaultProvider = 'anthropic';
const defaultAnthropicBaseUrl = 'https://api.anthropic.com';
const defaultAnthropicModel = 'claude-sonnet-4-5';

@Injectable()
export class UserSettingsService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserSettingEntity)
    private readonly settingRepo: Repository<UserSettingEntity>,
  ) {}

  async getSettings(userId: string) {
    const user = await this.getUser(userId);
    const apiSettings = await this.listApiSettings(userId);

    return {
      account: this.toAccount(user),
      api_settings: apiSettings,
      apiSettings,
    };
  }

  async updateUsername(userId: string, dto: UpdateUsernameDto) {
    const user = await this.getUser(userId);
    const username = this.normalizeUsername(dto.username);
    const existing = await this.userRepo.findOne({ where: { username } });

    if (existing && existing.id !== user.id) {
      throw new ConflictException(this.error('USERNAME_ALREADY_EXISTS', 'username already exists'));
    }

    user.username = username;
    user.displayName = dto.display_name ?? dto.displayName ?? user.displayName ?? username;

    try {
      await this.userRepo.save(user);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(this.error('USERNAME_ALREADY_EXISTS', 'username already exists'));
      }

      throw error;
    }

    return {
      message: 'username updated successfully',
      account: this.toAccount(user),
    };
  }

  async listApiSettings(userId: string) {
    await this.getUser(userId);
    const settings = await this.settingRepo.find({
      where: { userId: Number(userId) },
      order: { updatedAt: 'DESC' },
    });

    return settings.map((setting) => this.toApiSetting(setting));
  }

  async upsertApiSetting(userId: string, dto: UpsertApiSettingDto) {
    await this.getUser(userId);
    const provider = this.normalizeProvider(dto.provider);
    const apiKey = dto.api_key ?? dto.apiKey;
    const model = dto.model?.trim();
    const baseUrl = dto.base_url ?? dto.baseUrl;
    let setting = await this.findSettingWithSecret(Number(userId), provider);

    if (!setting) {
      setting = this.settingRepo.create({
        userId: Number(userId),
        provider,
      });
    }

    if (apiKey) {
      setting.apiKeyEncrypted = this.encryptSecret(apiKey);
      setting.apiKeyFingerprint = this.fingerprintSecret(apiKey);
      setting.apiKeyHint = this.maskApiKey(apiKey);
    }

    if (!setting.apiKeyEncrypted) {
      throw new BadRequestException(this.error('API_KEY_REQUIRED', 'api_key is required'));
    }

    setting.model = model ?? setting.model ?? defaultAnthropicModel;
    setting.baseUrl = this.normalizeBaseUrl(baseUrl ?? setting.baseUrl ?? defaultAnthropicBaseUrl);

    try {
      const saved = await this.settingRepo.save(setting);
      return {
        message: 'api setting saved successfully',
        api_setting: this.toApiSetting(saved),
        apiSetting: this.toApiSetting(saved),
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(this.error('USER_SETTING_ALREADY_EXISTS', 'api setting already exists'));
      }

      throw error;
    }
  }

  async testApiSetting(userId: string, dto: TestApiSettingDto) {
    await this.getUser(userId);
    const provider = this.normalizeProvider(dto.provider);
    const config = await this.resolveAgentConfig(userId, provider, dto);

    if (!config.apiKey) {
      throw new BadRequestException(this.error('API_KEY_REQUIRED', 'api_key is required'));
    }

    if (provider !== defaultProvider) {
      throw new BadRequestException(this.error('UNSUPPORTED_PROVIDER', 'only anthropic provider is supported'));
    }

    const baseUrl = this.normalizeBaseUrl(config.baseUrl ?? defaultAnthropicBaseUrl);
    const model = config.model ?? defaultAnthropicModel;
    const endpoint = `${baseUrl}/v1/messages`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [
            {
              role: 'user',
              content: 'ping',
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const body = await this.safeReadResponse(response);
        return {
          ok: false,
          provider,
          model,
          base_url: baseUrl,
          baseUrl,
          status: response.status,
          message: body || `Anthropic connection failed with status ${response.status}`,
        };
      }

      return {
        ok: true,
        provider,
        model,
        base_url: baseUrl,
        baseUrl,
        status: response.status,
        message: 'connection succeeded',
      };
    } catch (error) {
      return {
        ok: false,
        provider,
        model,
        base_url: baseUrl,
        baseUrl,
        status: 0,
        message: error instanceof Error ? error.message : 'connection failed',
      };
    }
  }

  async getAgentConfig(userId: number | string): Promise<UserAgentConfig> {
    const setting = await this.findSettingWithSecret(Number(userId), defaultProvider);

    if (!setting?.apiKeyEncrypted) {
      return {
        provider: defaultProvider,
      };
    }

    return {
      provider: setting.provider,
      apiKey: this.decryptSecret(setting.apiKeyEncrypted),
      baseUrl: setting.baseUrl ?? defaultAnthropicBaseUrl,
      model: setting.model ?? defaultAnthropicModel,
    };
  }

  private async resolveAgentConfig(
    userId: string,
    provider: string,
    dto: TestApiSettingDto,
  ): Promise<UserAgentConfig> {
    const apiKey = dto.api_key ?? dto.apiKey;
    if (apiKey) {
      return {
        provider,
        apiKey,
        baseUrl: dto.base_url ?? dto.baseUrl ?? defaultAnthropicBaseUrl,
        model: dto.model ?? defaultAnthropicModel,
      };
    }

    const saved = await this.findSettingWithSecret(Number(userId), provider);
    return {
      provider,
      apiKey: saved?.apiKeyEncrypted ? this.decryptSecret(saved.apiKeyEncrypted) : undefined,
      baseUrl: dto.base_url ?? dto.baseUrl ?? saved?.baseUrl ?? defaultAnthropicBaseUrl,
      model: dto.model ?? saved?.model ?? defaultAnthropicModel,
    };
  }

  private async getUser(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: Number(userId) } });
    if (!user) {
      throw new NotFoundException(this.error('USER_NOT_FOUND', 'user not found'));
    }

    return user;
  }

  private async findSettingWithSecret(userId: number, provider: string) {
    return this.settingRepo
      .createQueryBuilder('setting')
      .addSelect('setting.apiKeyEncrypted')
      .where('setting.userId = :userId', { userId })
      .andWhere('setting.provider = :provider', { provider })
      .getOne();
  }

  private toAccount(user: UserEntity) {
    const displayName = user.displayName ?? user.username ?? user.email?.split('@')[0] ?? '用户';

    return {
      id: String(user.id),
      email: user.email,
      username: user.username,
      display_name: displayName,
      displayName,
      created_at: user.createdAt?.toISOString(),
      createdAt: user.createdAt?.toISOString(),
      updated_at: user.updatedAt?.toISOString(),
      updatedAt: user.updatedAt?.toISOString(),
    };
  }

  private toApiSetting(setting: UserSettingEntity) {
    const createdAt = setting.createdAt?.toISOString();
    const updatedAt = setting.updatedAt?.toISOString();

    return {
      id: String(setting.id),
      user_id: String(setting.userId),
      userId: String(setting.userId),
      provider: setting.provider,
      model: setting.model,
      base_url: setting.baseUrl,
      baseUrl: setting.baseUrl,
      has_api_key: Boolean(setting.apiKeyFingerprint),
      hasApiKey: Boolean(setting.apiKeyFingerprint),
      api_key_hint: setting.apiKeyHint,
      apiKeyHint: setting.apiKeyHint,
      api_key_fingerprint: setting.apiKeyFingerprint,
      apiKeyFingerprint: setting.apiKeyFingerprint,
      created_at: createdAt,
      createdAt,
      updated_at: updatedAt,
      updatedAt,
    };
  }

  private encryptSecret(secret: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  private decryptSecret(payload: string) {
    const [version, iv, tag, encrypted] = payload.split(':');
    if (version !== 'v1' || !iv || !tag || !encrypted) {
      throw new BadRequestException(this.error('SECRET_DECRYPT_FAILED', 'api key cannot be decrypted'));
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private encryptionKey() {
    const secret =
      process.env.CAREER_AGENT_SETTINGS_SECRET ??
      process.env.CAREER_AGENT_JWT_SECRET ??
      process.env.JWT_SECRET ??
      'career-agent-dev-secret';

    return createHash('sha256').update(secret).digest();
  }

  private fingerprintSecret(secret: string) {
    return createHash('sha256').update(secret).digest('hex').slice(0, 16);
  }

  private maskApiKey(apiKey: string) {
    if (apiKey.length <= 10) {
      return '********';
    }

    return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
  }

  private normalizeProvider(provider?: string) {
    return provider?.trim().toLowerCase() || defaultProvider;
  }

  private normalizeUsername(username: string) {
    return username.trim().toLowerCase();
  }

  private normalizeBaseUrl(baseUrl: string) {
    const trimmed = baseUrl.trim().replace(/\/+$/, '');
    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('invalid protocol');
      }
    } catch {
      throw new BadRequestException(this.error('API_BASE_URL_INVALID', 'base_url must be a valid http or https URL'));
    }

    return trimmed;
  }

  private async safeReadResponse(response: Response) {
    try {
      const text = await response.text();
      return text.slice(0, 500);
    } catch {
      return '';
    }
  }

  private error(code: string, message: string) {
    return {
      code,
      message,
    };
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
