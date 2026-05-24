import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { UserSettingEntity } from './entities/user-setting.entity';
import { UserSettingsController } from './user-settings.controller';
import { UserSettingsService } from './user-settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UserSettingEntity])],
  controllers: [UserSettingsController],
  providers: [UserSettingsService],
  exports: [UserSettingsService],
})
export class UserSettingsModule {}
