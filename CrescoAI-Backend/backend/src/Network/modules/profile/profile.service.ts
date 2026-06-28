import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  createDefaultProfile,
  hasProfileInputFields,
  normalizeProfileRecord,
} from './profile.types';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async getProfile(userId: number) {
    const user = await this.findUser(userId);
    return normalizeProfileRecord(
      this.parseProfileJson(user.profileJson),
      user.displayName,
    );
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const source = dto.profile ?? dto;
    if (!hasProfileInputFields(source)) {
      throw new BadRequestException({
        code: 'PROFILE_VALIDATION_FAILED',
        message: 'profile must contain at least one supported profile field',
      });
    }

    const user = await this.findUser(userId);
    const profile = normalizeProfileRecord(source, user.displayName);

    user.profileJson = JSON.stringify(profile);
    if (profile.displayName) {
      user.displayName = profile.displayName;
    }
    await this.userRepo.save(user);

    return profile;
  }

  listSuggestions() {
    // Suggestions are conversation-derived and must not be invented from an
    // incomplete profile. Keep the endpoint stable until that pipeline writes
    // reviewable suggestions.
    return [];
  }

  private async findUser(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'user not found',
      });
    }
    return user;
  }

  private parseProfileJson(raw: string | null | undefined) {
    if (!raw) {
      return createDefaultProfile();
    }

    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return createDefaultProfile();
    }
  }
}
