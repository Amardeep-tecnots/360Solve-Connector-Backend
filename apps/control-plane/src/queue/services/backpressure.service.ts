import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BullMQService } from './bullmq.service';

interface CapacityInfo {
  availableSlots: number;
  queueDepth: number;
  maxQueueDepth: number;
  utilizationPercent: number;
}

interface TenantCapacity {
  tier: 'FREE' | 'STANDARD' | 'ENTERPRISE';
  maxConcurrentJobs: number;
  maxJobsPerHour: number;
  currentJobs: number;
  jobsThisHour: number;
}

@Injectable()
export class BackpressureService {
  private readonly logger = new Logger(BackpressureService.name);
  private readonly CAPACITY_CHECK_INTERVAL = 60000; // 1 minute
  private readonly UTILIZATION_THRESHOLD = 90; // 90%

  constructor(
    private readonly prisma: PrismaService,
    private readonly bullmq: BullMQService,
  ) {}

  async checkCapacity(tenantId: string): Promise<CapacityInfo> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { tier: true, maxConcurrentJobs: true },
    });

    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const queueName = this.getQueueName(tenant.tier);
    const stats = await this.bullmq.getJobCounts(queueName);

    const maxCapacity = tenant.maxConcurrentJobs || this.getTierCapacity(tenant.tier);
    const utilization = (stats.active / maxCapacity) * 100;

    return {
      availableSlots: Math.max(0, maxCapacity - stats.active),
      queueDepth: stats.waiting,
      maxQueueDepth: maxCapacity * 10,
      utilizationPercent: Math.round(utilization),
    };
  }

  async checkBeforeEnqueue(tenantId: string): Promise<void> {
    const capacity = await this.checkCapacity(tenantId);

    if (capacity.utilizationPercent > this.UTILIZATION_THRESHOLD) {
      throw new Error(
        `System at capacity (${capacity.utilizationPercent}% utilization). ` +
        `Please retry in 60 seconds.`
      );
    }

    if (capacity.queueDepth > capacity.maxQueueDepth) {
      throw new Error(
        `Queue backlog too high (${capacity.queueDepth}). ` +
        `Please wait for jobs to complete.`
      );
    }
  }

  async getTenantCapacity(tenantId: string): Promise<TenantCapacity> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        tier: true,
        maxConcurrentJobs: true,
        maxJobsPerHour: true,
      },
    });

    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    // Get current job counts
    const queueName = this.getQueueName(tenant.tier);
    const stats = await this.bullmq.getJobCounts(queueName);

    // Get jobs in the last hour
    const oneHourAgo = new Date(Date.now() - 3600000);
    const jobsThisHour = await this.prisma.workflowExecution.count({
      where: {
        tenantId,
        startedAt: { gte: oneHourAgo },
      },
    });

    return {
      tier: tenant.tier,
      maxConcurrentJobs: tenant.maxConcurrentJobs || this.getTierCapacity(tenant.tier),
      maxJobsPerHour: tenant.maxJobsPerHour || this.getTierHourlyLimit(tenant.tier),
      currentJobs: stats.active,
      jobsThisHour,
    };
  }

  async enforceRateLimit(tenantId: string): Promise<boolean> {
    const capacity = await this.getTenantCapacity(tenantId);

    if (capacity.jobsThisHour >= capacity.maxJobsPerHour) {
      this.logger.warn(
        `Tenant ${tenantId} exceeded hourly limit (${capacity.jobsThisHour}/${capacity.maxJobsPerHour})`
      );
      return false;
    }

    return true;
  }

  getQueueName(tier: string): string {
    switch (tier) {
      case 'FREE':
        return 'workflow-exec-free';
      case 'STANDARD':
        return 'workflow-exec-standard';
      case 'ENTERPRISE':
        return 'workflow-exec-enterprise';
      default:
        return 'workflow-exec-free';
    }
  }

  private getTierCapacity(tier: string): number {
    switch (tier) {
      case 'FREE':
        return 5;
      case 'STANDARD':
        return 20;
      case 'ENTERPRISE':
        return 100;
      default:
        return 5;
    }
  }

  private getTierHourlyLimit(tier: string): number {
    switch (tier) {
      case 'FREE':
        return 100;
      case 'STANDARD':
        return 1000;
      case 'ENTERPRISE':
        return 10000;
      default:
        return 100;
    }
  }

  async getSystemCapacity(): Promise<{
    totalCapacity: number;
    usedCapacity: number;
    availableCapacity: number;
    byTier: { [tier: string]: CapacityInfo };
  }> {
    const tiers = ['FREE', 'STANDARD', 'ENTERPRISE'];
    const byTier: { [tier: string]: CapacityInfo } = {};

    let totalCapacity = 0;
    let usedCapacity = 0;

    for (const tier of tiers) {
      const queueName = this.getQueueName(tier);
      const stats = await this.bullmq.getJobCounts(queueName);
      const maxCapacity = this.getTierCapacity(tier);

      totalCapacity += maxCapacity;
      usedCapacity += stats.active;

      byTier[tier] = {
        availableSlots: Math.max(0, maxCapacity - stats.active),
        queueDepth: stats.waiting,
        maxQueueDepth: maxCapacity * 10,
        utilizationPercent: Math.round((stats.active / maxCapacity) * 100),
      };
    }

    return {
      totalCapacity,
      usedCapacity,
      availableCapacity: Math.max(0, totalCapacity - usedCapacity),
      byTier,
    };
  }
}
