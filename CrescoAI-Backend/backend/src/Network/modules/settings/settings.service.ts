import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ApiSettingsEntity } from './entities/api-settings.entity';
import { UpdateApiSettingsDto } from './dto/update-api-settings.dto';
import { UpdateUsernameDto } from './dto/update-username.dto';
import { UserEntity } from '../user/entities/user.entity';
import { applyPublicAccountPatch } from '../integration/account-publication';

const defaultAnthropicBaseUrl = 'https://api.anthropic.com';
const defaultAnthropicModel = 'claude-sonnet-4-5';

@Injectable()
export class SettingsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ApiSettingsEntity)
    private readonly settingsRepo: Repository<ApiSettingsEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  /** Full settings page response — account + api_settings array */
  async getSettings(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    const setting = await this.settingsRepo.findOne({ where: { userId } });
    const apiSettings = setting && user
      ? [this.toApiSettingView(setting, user.publicUserId)]
      : [];

    return {
      account: user
        ? {
            id: user.publicUserId!,
            publicUserId: user.publicUserId!,
            public_user_id: user.publicUserId!,
            email: user.email,
            username: user.username,
            display_name: user.displayName,
            displayName: user.displayName,
            created_at: user.createdAt?.toISOString() ?? null,
            createdAt: user.createdAt?.toISOString() ?? null,
            updated_at: user.updatedAt?.toISOString() ?? null,
            updatedAt: user.updatedAt?.toISOString() ?? null,
          }
        : null,
      api_settings: apiSettings,
      apiSettings,
    };
  }

  /** Raw entity used internally by AgentService / SkillService */
  async getApiSettings(userId: number): Promise<ApiSettingsEntity | null> {
    return this.settingsRepo.findOne({ where: { userId } });
  }

  /** List endpoint — returns array of normalised view objects */
  async listApiSettings(userId: number) {
    const [setting, user] = await Promise.all([
      this.settingsRepo.findOne({ where: { userId } }),
      this.userRepo.findOne({ where: { id: userId } }),
    ]);
    return setting && user
      ? [this.toApiSettingView(setting, user.publicUserId)]
      : [];
  }

  async upsertSettings(userId: number, dto: UpdateApiSettingsDto) {
    const apiKey = dto.api_key ?? dto.apiKey;
    const baseUrl = dto.base_url ?? dto.baseUrl;
    const provider = this.normalizeProvider(dto.provider);

    let existing = await this.settingsRepo.findOne({ where: { userId } });

    if (!existing) {
      existing = this.settingsRepo.create({ userId, provider: provider ?? 'anthropic' });
    }

    if (provider !== undefined) existing.provider = provider;
    if (apiKey !== undefined) existing.apiKey = apiKey;
    if (baseUrl !== undefined) existing.baseUrl = baseUrl;
    if (dto.model !== undefined) existing.model = dto.model;

    const imageUrl = dto.image_url ?? dto.imageUrl;
    const imageKey = dto.image_key ?? dto.imageKey;
    const imageDefaultModel = dto.image_default_model ?? dto.imageDefaultModel;
    const imageModels = dto.image_models ?? dto.imageModels;
    const videoUrl = dto.video_url ?? dto.videoUrl;
    const videoKey = dto.video_key ?? dto.videoKey;
    const videoDefaultModel = dto.video_default_model ?? dto.videoDefaultModel;
    const videoModels = dto.video_models ?? dto.videoModels;

    if (imageUrl !== undefined) existing.imageUrl = imageUrl;
    if (imageKey !== undefined) existing.imageKey = imageKey;
    if (imageDefaultModel !== undefined) existing.imageDefaultModel = imageDefaultModel;
    if (imageModels !== undefined) existing.imageModels = imageModels;
    if (videoUrl !== undefined) existing.videoUrl = videoUrl;
    if (videoKey !== undefined) existing.videoKey = videoKey;
    if (videoDefaultModel !== undefined) existing.videoDefaultModel = videoDefaultModel;
    if (videoModels !== undefined) existing.videoModels = videoModels;

    const saved = await this.settingsRepo.save(existing);
    const publicUserId = await this.getPublicUserId(userId);
    const view = this.toApiSettingView(saved, publicUserId);

    return {
      message: 'api setting saved successfully',
      api_setting: view,
      apiSetting: view,
    };
  }

  async updateUsername(userId: number, dto: UpdateUsernameDto) {
    const username = dto.username.trim().toLowerCase();
    try {
      return await this.dataSource.transaction(async (manager) => {
        const user = await manager.findOne(UserEntity, { where: { id: userId } });
        if (!user) {
          throw new NotFoundException('user not found');
        }
        const existing = await manager.findOne(UserEntity, {
          where: { username },
        });
        if (existing && existing.id !== userId) {
          throw new ConflictException({
            code: 'USERNAME_ALREADY_EXISTS',
            message: 'username already exists',
          });
        }

        user.username = username;
        await applyPublicAccountPatch(manager, user, {
          displayName:
            dto.display_name ?? dto.displayName ?? user.displayName ?? username,
        });
        // Username is not part of the external account contract. Persist it
        // even when the public account fields did not change.
        await manager.save(user);

        return {
          message: 'username updated successfully',
          account: {
            id: user.publicUserId!,
            publicUserId: user.publicUserId!,
            public_user_id: user.publicUserId!,
            email: user.email,
            username: user.username,
            display_name: user.displayName,
            displayName: user.displayName,
            created_at: user.createdAt?.toISOString() ?? null,
            createdAt: user.createdAt?.toISOString() ?? null,
            updated_at: user.updatedAt?.toISOString() ?? null,
            updatedAt: user.updatedAt?.toISOString() ?? null,
          },
        };
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException({ code: 'USERNAME_ALREADY_EXISTS', message: 'username already exists' });
      }
      throw error;
    }
  }

  async testApiSetting(userId: number, dto: UpdateApiSettingsDto) {
    const saved = await this.settingsRepo.findOne({ where: { userId } });
    const apiKey = (dto.api_key ?? dto.apiKey ?? saved?.apiKey ?? '').trim();
    const baseUrl = this.normalizeBaseUrl(dto.base_url ?? dto.baseUrl ?? saved?.baseUrl ?? defaultAnthropicBaseUrl);
    const model = (dto.model ?? saved?.model ?? defaultAnthropicModel).trim();
    const provider = this.normalizeProvider(dto.provider ?? saved?.provider) ?? 'anthropic';

    if (!apiKey) {
      throw new BadRequestException({ code: 'API_KEY_REQUIRED', message: 'api_key is required' });
    }

    const openAICompatible = provider === 'openai' || provider === 'openrouter';
    const endpoint = openAICompatible
      ? this.openAIChatCompletionsUrl(baseUrl)
      : `${baseUrl}/v1/messages`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(openAICompatible
            ? { authorization: `Bearer ${apiKey}` }
            : { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }),
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        return {
          ok: false,
          provider,
          model,
          base_url: baseUrl,
          baseUrl,
          status: response.status,
          message: body || `connection failed with status ${response.status}`,
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

  private async getPublicUserId(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('user not found');
    }
    return user.publicUserId;
  }

  private toApiSettingView(setting: ApiSettingsEntity, publicUserId: string) {
    return {
      id: String(setting.id),
      userId: publicUserId,
      user_id: publicUserId,
      provider: setting.provider ?? 'anthropic',
      model: setting.model ?? defaultAnthropicModel,
      base_url: setting.baseUrl ?? defaultAnthropicBaseUrl,
      baseUrl: setting.baseUrl ?? defaultAnthropicBaseUrl,
      has_api_key: Boolean(setting.apiKey),
      hasApiKey: Boolean(setting.apiKey),
      api_key_hint: setting.apiKey ? `${setting.apiKey.slice(0, 8)}...` : null,
      apiKeyHint: setting.apiKey ? `${setting.apiKey.slice(0, 8)}...` : null,
      api_key_fingerprint: null,
      apiKeyFingerprint: null,
      created_at: setting.createdAt?.toISOString() ?? null,
      createdAt: setting.createdAt?.toISOString() ?? null,
      updated_at: setting.updatedAt?.toISOString() ?? null,
      updatedAt: setting.updatedAt?.toISOString() ?? null,
      // Multimodal
      image_url: setting.imageUrl ?? null,
      imageUrl: setting.imageUrl ?? null,
      has_image_key: Boolean(setting.imageKey),
      hasImageKey: Boolean(setting.imageKey),
      image_key_hint: setting.imageKey ? `${setting.imageKey.slice(0, 8)}...` : null,
      imageKeyHint: setting.imageKey ? `${setting.imageKey.slice(0, 8)}...` : null,
      image_default_model: setting.imageDefaultModel ?? null,
      imageDefaultModel: setting.imageDefaultModel ?? null,
      image_models: setting.imageModels ? this.parseModels(setting.imageModels) : [],
      imageModels: setting.imageModels ? this.parseModels(setting.imageModels) : [],
      video_url: setting.videoUrl ?? null,
      videoUrl: setting.videoUrl ?? null,
      has_video_key: Boolean(setting.videoKey),
      hasVideoKey: Boolean(setting.videoKey),
      video_key_hint: setting.videoKey ? `${setting.videoKey.slice(0, 8)}...` : null,
      videoKeyHint: setting.videoKey ? `${setting.videoKey.slice(0, 8)}...` : null,
      video_default_model: setting.videoDefaultModel ?? null,
      videoDefaultModel: setting.videoDefaultModel ?? null,
      video_models: setting.videoModels ? this.parseModels(setting.videoModels) : [],
      videoModels: setting.videoModels ? this.parseModels(setting.videoModels) : [],
    };
  }

  private parseModels(raw: string): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  private normalizeBaseUrl(url: string) {
    return url.trim().replace(/\/+$/, '');
  }

  private normalizeProvider(provider: string | undefined): string | undefined {
    if (provider === undefined) return undefined;
    const normalized = provider.trim().toLowerCase().replace(/[_\s]+/g, '-');
    if (normalized === 'openai-compatible') return 'openai';
    return normalized || 'anthropic';
  }

  private openAIChatCompletionsUrl(baseUrl: string): string {
    if (/\/chat\/completions$/i.test(baseUrl)) return baseUrl;
    if (/\/v1$/i.test(baseUrl)) return `${baseUrl}/chat/completions`;
    return `${baseUrl}/v1/chat/completions`;
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      String((error as any).message).toLowerCase().includes('unique')
    );
  }
}
