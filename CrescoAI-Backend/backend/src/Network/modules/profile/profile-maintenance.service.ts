import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { ProfileProjectionJobEntity } from './entities/profile-projection-job.entity';
import { profileFeatureFlags } from './profile-feature-flags';
import { ProfileMemoryService } from './profile-memory.service';
import { ProfileProjectionService } from './profile-projection.service';

@Injectable()
export class ProfileMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProfileMaintenanceService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    @InjectRepository(ProfileProjectionJobEntity)
    private readonly jobRepo: Repository<ProfileProjectionJobEntity>,
    private readonly projectionService: ProfileProjectionService,
    private readonly memoryService: ProfileMemoryService,
  ) {}

  onModuleInit() {
    if (!profileFeatureFlags.projectionWorker()) return;
    this.timer = setInterval(() => void this.runOnce(), 30_000);
    this.timer.unref?.();
    void this.runOnce();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      await this.memoryService.expireDueMemories(50);
      const jobs = await this.jobRepo.find({
        where: {
          status: In(['pending', 'failed']),
          retryCount: LessThan(5),
        },
        order: { targetVersion: 'ASC' },
        take: 50,
      });
      const latestByUser = new Map<number, ProfileProjectionJobEntity>();
      for (const job of jobs) latestByUser.set(job.userId, job);
      for (const job of latestByUser.values()) {
        const result = await this.projectionService.projectUser(job.userId, job.targetVersion);
        if (result.status === 'failed') {
          this.logger.warn(`Profile projection failed for user ${job.userId}: ${result.error}`);
        }
      }
    } catch (error) {
      this.logger.error('Profile maintenance pass failed', error instanceof Error ? error.stack : String(error));
    } finally {
      this.running = false;
    }
  }

  async health(userId: number) {
    const [pending, failed] = await Promise.all([
      this.jobRepo.count({ where: { userId, status: 'pending' } }),
      this.jobRepo.count({ where: { userId, status: 'failed' } }),
    ]);
    return { projectionWorkerEnabled: profileFeatureFlags.projectionWorker(), pending, failed };
  }
}
