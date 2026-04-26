import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentModule } from '../agent/agent.module';
import { ArtifactEntity } from './entities/artifact.entity';
import { ArtifactService } from './artifact.service';
import { ArtifactController } from './artifact.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ArtifactEntity]), AgentModule],
  controllers: [ArtifactController],
  providers: [ArtifactService],
})
export class ArtifactModule {}
