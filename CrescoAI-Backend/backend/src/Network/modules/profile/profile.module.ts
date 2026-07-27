import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { CareerProfileVersionEntity } from './entities/career-profile-version.entity';
import { ProfileSuggestionEntity } from './entities/profile-suggestion.entity';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      ProfileSuggestionEntity,
      CareerProfileVersionEntity,
    ]),
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
