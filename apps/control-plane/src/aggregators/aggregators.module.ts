import { Module } from '@nestjs/common';
import { AggregatorsController } from './aggregators.controller';
import { AggregatorsService } from './aggregators.service';
import { TenantAggregatorsController } from './tenant-aggregators.controller';
import { TenantAggregatorsService } from './tenant-aggregators.service';
import { SchemaDiscoveryController } from './schema-discovery.controller';
import { SchemaDiscoveryService } from './schema-discovery.service';
import { PrismaService } from '../prisma.service';
import { EncryptionService } from '../common/services/encryption.service';
import { ConnectionFactoryService } from './connections/connection-factory.service';

@Module({
  controllers: [AggregatorsController, TenantAggregatorsController, SchemaDiscoveryController],
  providers: [AggregatorsService, TenantAggregatorsService, SchemaDiscoveryService, PrismaService, EncryptionService, ConnectionFactoryService],
  exports: [AggregatorsService, TenantAggregatorsService, SchemaDiscoveryService, ConnectionFactoryService],
})
export class AggregatorsModule {}
