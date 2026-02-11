import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AggregatorsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, options: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
  }) {
    const { page = 1, limit = 20, category, search } = options;

    const where: any = {
      isPublic: true,
    };

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [aggregators, total] = await Promise.all([
      this.prisma.aggregator.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              instances: {
                where: { tenantId },
              },
            },
          },
        },
      }),
      this.prisma.aggregator.count({ where }),
    ]);

    return {
      data: aggregators.map((agg) => ({
        id: agg.id,
        name: agg.name,
        description: agg.description,
        category: agg.category,
        type: agg.type,
        version: agg.version,
        capabilities: agg.capabilities,
        authMethods: agg.authMethods,
        configSchema: agg.configSchema,
        logoUrl: agg.logoUrl,
        installCount: agg._count?.instances ?? 0,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const aggregator = await this.prisma.aggregator.findUnique({
      where: { id },
    });

    if (!aggregator) {
      return null;
    }

    return {
      id: aggregator.id,
      name: aggregator.name,
      description: aggregator.description,
      category: aggregator.category,
      type: aggregator.type,
      version: aggregator.version,
      capabilities: aggregator.capabilities,
      authMethods: aggregator.authMethods,
      configSchema: aggregator.configSchema,
      documentationUrl: aggregator.documentationUrl,
      logoUrl: aggregator.logoUrl,
    };
  }
}
