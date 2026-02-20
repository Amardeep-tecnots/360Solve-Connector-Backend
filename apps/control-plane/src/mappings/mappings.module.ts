import { Module } from '@nestjs/common';
import { MappingsController } from './mappings.controller';
import { MappingsService } from './mappings.service';
import { AIModule } from '../ai/ai.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [AIModule],
  controllers: [MappingsController],
  providers: [MappingsService, PrismaService],
  exports: [MappingsService],
})
export class MappingsModule {}