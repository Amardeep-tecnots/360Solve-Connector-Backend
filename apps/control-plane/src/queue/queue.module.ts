import { Module } from '@nestjs/common';
import { BullMQService } from './services/bullmq.service';
import { BackpressureService } from './services/backpressure.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [
    BullMQService,
    BackpressureService,
    PrismaService,
  ],
  exports: [
    BullMQService,
    BackpressureService,
  ],
})
export class QueueModule {}
