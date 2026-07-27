import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { ProfileSuggestionEntity } from './entities/profile-suggestion.entity';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ProfileV2Service } from './profile-v2.service';
import { BaseProfileEntity } from './entities/base-profile.entity';
import { ProfileStateEntity } from './entities/profile-state.entity';
import { ProfileRevisionEntity } from './entities/profile-revision.entity';
import { ProfileMemoryItemEntity } from './entities/profile-memory-item.entity';
import { ProfileProjectionJobEntity } from './entities/profile-projection-job.entity';
import { ProfileMemoryService } from './profile-memory.service';
import { ProfileProjectionService } from './profile-projection.service';
import { ProfileMemoryFileStore } from './profile-memory-file.store';
import { ProfileChangeProposalEntity } from './entities/profile-change-proposal.entity';
import { ProfileProposalService } from './profile-proposal.service';
import { ProfilePolicyService } from './profile-policy.service';
import { ProfileRecallService } from './profile-recall.service';
import { ProfileMaintenanceService } from './profile-maintenance.service';
import { ProfileLegacyMigrationService } from './profile-legacy-migration.service';
import { ProfileExternalSnapshotService } from './profile-external-snapshot.service';
import { ProfileLegacyAdapterService } from './profile-legacy-adapter.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      ProfileSuggestionEntity,
      BaseProfileEntity,
      ProfileStateEntity,
      ProfileRevisionEntity,
      ProfileMemoryItemEntity,
      ProfileProjectionJobEntity,
      ProfileChangeProposalEntity,
    ]),
  ],
  controllers: [ProfileController],
  providers: [
    ProfileService,
    ProfileV2Service,
    ProfileMemoryService,
    ProfileProjectionService,
    ProfileMemoryFileStore,
    ProfileProposalService,
    ProfilePolicyService,
    ProfileRecallService,
    ProfileMaintenanceService,
    ProfileLegacyMigrationService,
    ProfileExternalSnapshotService,
    ProfileLegacyAdapterService,
  ],
  exports: [
    ProfileService,
    ProfileV2Service,
    ProfileMemoryService,
    ProfileProjectionService,
    ProfileProposalService,
    ProfileRecallService,
    ProfileMaintenanceService,
    ProfileExternalSnapshotService,
  ],
})
export class ProfileModule {}
