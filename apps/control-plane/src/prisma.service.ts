import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { LoggerService } from '@360solve/shared';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new LoggerService('prisma');

  constructor() {
    const logLevel = process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error', 'warn'];

    super({
      log: logLevel as Prisma.LogLevel[],
    });

    // Add query logging middleware
    this.$use(async (params, next) => {
      const start = Date.now();
      const result = await next(params);
      const duration = Date.now() - start;

      // Only log slow queries (> 100ms) in production, all in development
      const threshold = process.env.NODE_ENV === 'production' ? 100 : 0;

      if (duration > threshold) {
        this.logger.debug('Prisma query executed', {
          model: params.model,
          action: params.action,
          duration,
          slow: duration > 100,
        });
      }

      return result;
    });
  }

  async onModuleInit() {
    this.logger.info('Connecting to database...');
    await this.$connect();
    this.logger.info('Database connected successfully');
  }

  async onModuleDestroy() {
    this.logger.info('Disconnecting from database...');
    await this.$disconnect();
    this.logger.info('Database disconnected');
  }
}
