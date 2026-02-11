import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowValidationService } from './workflow-validation.service';
import { PrismaService } from '../../prisma.service';

describe('WorkflowValidationService', () => {
  let service: WorkflowValidationService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    aggregatorInstance: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowValidationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<WorkflowValidationService>(WorkflowValidationService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validate', () => {
    it('should validate a valid workflow with extract -> transform -> load', async () => {
      const definition = {
        version: '1.0' as const,
        activities: [
          {
            id: 'extract-1',
            type: 'extract' as const,
            name: 'Extract Customers',
            config: {
              aggregatorInstanceId: 'instance-123',
              table: 'customers',
              columns: ['id', 'name', 'email'],
            },
          },
          {
            id: 'transform-1',
            type: 'transform' as const,
            name: 'Transform Data',
            config: {
              code: 'return data.map(r => ({...r, name: r.name.toUpperCase()}))',
            },
          },
          {
            id: 'load-1',
            type: 'load' as const,
            name: 'Load to Analytics',
            config: {
              aggregatorInstanceId: 'instance-456',
              table: 'dim_customers',
              mode: 'upsert' as const,
              conflictKey: 'customer_id',
            },
          },
        ],
        steps: [
          { id: 'step-1', activityId: 'extract-1', dependsOn: [] as string[] },
          { id: 'step-2', activityId: 'transform-1', dependsOn: ['step-1'] },
          { id: 'step-3', activityId: 'load-1', dependsOn: ['step-2'] },
        ],
      } as const;

      mockPrismaService.aggregatorInstance.findFirst.mockResolvedValue({
        id: 'instance-123',
        aggregator: {
          name: 'MySQL Connector',
          capabilities: ['read', 'write'],
        },
      });

      const result = await service.validate('tenant-123', definition as any);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.activitiesChecked).toBe(3);
      expect(result.aggregatorsVerified).toContain('MySQL Connector');
    });

    it('should detect circular dependencies', async () => {
      const definition = {
        version: '1.0' as const,
        activities: [
          {
            id: 'extract-1',
            type: 'extract' as const,
            name: 'Extract',
            config: {
              aggregatorInstanceId: 'instance-123',
              table: 'customers',
              columns: ['id'],
            },
          },
        ],
        steps: [
          { id: 'step-1', activityId: 'extract-1', dependsOn: ['step-2'] },
          { id: 'step-2', activityId: 'extract-1', dependsOn: ['step-1'] },
        ],
      } as const;

      const result = await service.validate('tenant-123', definition as any);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'steps',
        message: expect.stringContaining('Circular dependency'),
      });
    });

    it('should detect missing aggregator instance', async () => {
      const definition = {
        version: '1.0' as const,
        activities: [
          {
            id: 'extract-1',
            type: 'extract' as const,
            name: 'Extract',
            config: {
              aggregatorInstanceId: 'non-existent',
              table: 'customers',
              columns: ['id'],
            },
          },
        ],
        steps: [
          { id: 'step-1', activityId: 'extract-1', dependsOn: [] as string[] },
        ],
      } as const;

      mockPrismaService.aggregatorInstance.findFirst.mockResolvedValue(null);

      const result = await service.validate('tenant-123', definition as any);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'activities.extract-1.config.aggregatorInstanceId',
        message: 'Aggregator instance "non-existent" not found',
      });
    });

    it('should warn about missing write capability', async () => {
      const definition = {
        version: '1.0' as const,
        activities: [
          {
            id: 'load-1',
            type: 'load' as const,
            name: 'Load',
            config: {
              aggregatorInstanceId: 'instance-123',
              table: 'customers',
              mode: 'insert' as const,
            },
          },
        ],
        steps: [
          { id: 'step-1', activityId: 'load-1', dependsOn: [] as string[] },
        ],
      } as const;

      mockPrismaService.aggregatorInstance.findFirst.mockResolvedValue({
        id: 'instance-123',
        aggregator: {
          name: 'Read-only Connector',
          capabilities: ['read'], // No write capability
        },
      });

      const result = await service.validate('tenant-123', definition as any);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'Aggregator "Read-only Connector" does not have \'write\' capability',
      );
    });

    it('should validate cron expression format', async () => {
      const definition = {
        version: '1.0' as const,
        activities: [],
        steps: [],
        schedule: 'invalid-cron',
      };

      const result = await service.validate('tenant-123', definition as any);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'schedule',
        message: 'Invalid cron expression format',
      });
    });
  });
});
