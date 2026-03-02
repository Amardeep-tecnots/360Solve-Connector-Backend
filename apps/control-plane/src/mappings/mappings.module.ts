import { Module } from '@nestjs/common';
import { MappingsController } from './mappings.controller';
import { MappingsService } from './mappings.service';
import { AIModule } from '../ai/ai.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [AIModule, ConnectorsModule],
  controllers: [MappingsController],
  providers: [MappingsService, PrismaService],
  exports: [MappingsService],
})
export class MappingsModule {}
