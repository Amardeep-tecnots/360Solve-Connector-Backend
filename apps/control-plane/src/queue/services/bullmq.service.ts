import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class BullMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BullMQService.name);
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.initializeQueues();
    await this.initializeWorkers();
    this.logger.log('BullMQ initialized');
  }

  async onModuleDestroy() {
    await this.closeAll();
  }

  private async initializeQueues() {
    const queues = [
      'workflow-exec-free',
      'workflow-exec-standard',
      'workflow-exec-enterprise',
    ];

    for (const queueName of queues) {
      const queue = new Queue(queueName, {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
      });

      this.queues.set(queueName, queue);
      this.logger.log(`Queue initialized: ${queueName}`);
    }
  }

  private async initializeWorkers() {
    const workerConfig = {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    };

    // Free tier: 5 workers
    const freeWorker = new Worker('workflow-exec-free', this.processJob.bind(this), {
      ...workerConfig,
      concurrency: 5,
    });

    // Standard tier: 20 workers
    const standardWorker = new Worker('workflow-exec-standard', this.processJob.bind(this), {
      ...workerConfig,
      concurrency: 20,
    });

    // Enterprise tier: 100 workers
    const enterpriseWorker = new Worker('workflow-exec-enterprise', this.processJob.bind(this), {
      ...workerConfig,
      concurrency: 100,
    });

    this.workers.set('free', freeWorker);
    this.workers.set('standard', standardWorker);
    this.workers.set('enterprise', enterpriseWorker);

    this.logger.log('Workers initialized');
  }

  async addJob(
    queueName: string,
    jobName: string,
    data: any,
    options?: any
  ): Promise<Job> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    return queue.add(jobName, data, options);
  }

  async getJobCounts(queueName: string): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    return queue.getJobCounts();
  }

  async getQueueStats(): Promise<{ [key: string]: any }> {
    const stats: { [key: string]: any } = {};

    for (const [name, queue] of this.queues.entries()) {
      const counts = await queue.getJobCounts();
      stats[name] = {
        waiting: counts.waiting,
        active: counts.active,
        completed: counts.completed,
        failed: counts.failed,
      };
    }

    return stats;
  }

  private async processJob(job: Job): Promise<any> {
    this.logger.log(`Processing job ${job.id}: ${job.name}`);

    try {
      // TODO: Execute activity based on job data
      const result = {
        success: true,
        data: job.data,
      };

      return result;

    } catch (error) {
      this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async closeAll() {
    for (const [name, queue] of this.queues.entries()) {
      await queue.close();
      this.logger.log(`Queue closed: ${name}`);
    }

    for (const [name, worker] of this.workers.entries()) {
      await worker.close();
      this.logger.log(`Worker closed: ${name}`);
    }
  }
}
