import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiSettingsEntity } from './entities/api-settings.entity';
import { UpdateApiSettingsDto } from './dto/update-api-settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(ApiSettingsEntity)
    private readonly settingsRepo: Repository<ApiSettingsEntity>,
  ) {}

  async getSettings(userId: number): Promise<ApiSettingsEntity | null> {
    return this.settingsRepo.findOne({ where: { userId } });
  }

  async upsertSettings(userId: number, dto: UpdateApiSettingsDto): Promise<ApiSettingsEntity> {
    let existing = await this.settingsRepo.findOne({ where: { userId } });

    if (!existing) {
      existing = this.settingsRepo.create({ userId, ...dto });
    } else {
      if (dto.apiKey !== undefined) existing.apiKey = dto.apiKey;
      if (dto.baseUrl !== undefined) existing.baseUrl = dto.baseUrl;
      if (dto.model !== undefined) existing.model = dto.model;
    }

    return this.settingsRepo.save(existing);
  }
}
