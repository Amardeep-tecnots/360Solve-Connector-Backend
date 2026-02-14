import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';
import { ConnectorQueryDto } from './dto/connector-query.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class ConnectorsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateConnectorDto) {
    // Generate API Key for Mini Connectors
    // Format: vmc_<tenant>_<random>_<checksum>
    let apiKey: string | undefined;
    let apiKeyHash: string | undefined;
    let apiKeyPrefix: string | undefined;

    if (dto.type === 'MINI') {
      const randomPart = randomBytes(16).toString('hex');
      const prefix = 'vmc';
      const data = `${prefix}:${tenantId}:${randomPart}`;
      const hash = crypto.createHash('sha256').update(data).digest('hex');
      const checksum = hash.substring(0, 4);

      apiKey = `${prefix}_${tenantId}_${randomPart}_${checksum}`;
      apiKeyPrefix = apiKey.substring(0, 8);
      apiKeyHash = await bcrypt.hash(apiKey, 10);
    }

    const connector = await this.prisma.connector.create({
      data: {
        tenantId,
        name: dto.name,
        type: dto.type,
        networkAccess: dto.networkAccess,
        supportedAggregators: dto.supportedAggregators || [],
        apiKeyHash,
        apiKeyPrefix,
        status: 'OFFLINE', // Initial status
      },
    });

    return { ...connector, apiKey }; // Return API key only once
  }

  async findAll(tenantId: string, query: ConnectorQueryDto) {
    const { status, type, search } = query;
    const where: any = { tenantId };

    if (status) where.status = status;
    if (type) where.type = type;
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    return this.prisma.connector.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const connector = await this.prisma.connector.findFirst({
      where: { id, tenantId },
    });

    if (!connector) {
      throw new NotFoundException(`Connector with ID "${id}" not found`);
    }

    return connector;
  }

  async update(id: string, tenantId: string, dto: UpdateConnectorDto) {
    await this.findOne(id, tenantId); // Verify existence

    return this.prisma.connector.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId); // Verify existence

    return this.prisma.connector.delete({
      where: { id },
    });
  }

  async heartbeat(id: string, dto: HeartbeatDto) {
    // Note: In a real scenario, we might need to verify the API key here or use a specific Guard
    // For now, we update based on ID
    
    const status = dto.status ? dto.status.toUpperCase() : undefined;

    return this.prisma.connector.update({
      where: { id },
      data: {
        lastHeartbeat: dto.timestamp ? new Date(dto.timestamp) : new Date(),
        status: (status as any) ?? 'ONLINE',
        cpuUsage: dto.cpuUsage,
        memoryUsage: dto.memoryUsage,
        maxConcurrentJobs: dto.maxConcurrentJobs,
        os: dto.os,
        ipAddress: dto.ipAddress,
        hostname: dto.hostname,
        version: dto.version,
        supportedAggregators: dto.supportedAggregators,
      },
    });
  }

  async validateApiKey(apiKey: string): Promise<{ valid: boolean; tenantId?: string; connectorId?: string }> {
    // Validate API key format first
    const keyParts = apiKey.split('_');
    if (keyParts.length !== 4 || keyParts[0] !== 'vmc') {
      return { valid: false };
    }

    const tenantId = keyParts[1];

    // Find ALL connectors for tenant to avoid mismatching when multiple exist
    const connectors = await this.prisma.connector.findMany({
      where: {
        tenantId,
        type: 'MINI',
        status: { in: ['OFFLINE', 'ONLINE'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const connector of connectors) {
      if (!connector.apiKeyHash) continue;
      const isValid = await bcrypt.compare(apiKey, connector.apiKeyHash);
      if (isValid) {
        return {
          valid: true,
          tenantId: connector.tenantId,
          connectorId: connector.id,
        };
      }
    }

    return { valid: false };
  }
}
