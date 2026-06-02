import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtifactEntity } from './entities/artifact.entity';
import { ArtifactService } from './artifact.service';
import { ArtifactController } from './artifact.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ArtifactEntity])],
  controllers: [ArtifactController],
  providers: [ArtifactService],
})
export class ArtifactModule {}
