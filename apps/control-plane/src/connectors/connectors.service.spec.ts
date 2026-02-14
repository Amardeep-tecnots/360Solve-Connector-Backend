import { Test, TestingModule } from '@nestjs/testing';
import { ConnectorsService } from './connectors.service';
import { PrismaService } from '../prisma.service';
import { ConnectorType, NetworkAccessType } from '@prisma/client';

describe('ConnectorsService', () => {
  let service: ConnectorsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    connector: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectorsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ConnectorsService>(ConnectorsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a cloud connector', async () => {
      const dto = {
        name: 'Test Connector',
        type: ConnectorType.CLOUD,
        networkAccess: NetworkAccessType.LOCAL,
      };
      const tenantId = 'tenant-1';
      const expectedResult = { id: '1', ...dto, tenantId };

      mockPrismaService.connector.create.mockResolvedValue(expectedResult);

      const result = await service.create(tenantId, dto);

      expect(result).toEqual(expectedResult);
      expect(prisma.connector.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          name: dto.name,
          type: dto.type,
        }),
      });
    });

    it('should create a mini connector with api key', async () => {
      const dto = {
        name: 'Mini Connector',
        type: ConnectorType.MINI,
      };
      const tenantId = 'tenant-1';
      const expectedResult = { id: '2', ...dto, tenantId };

      mockPrismaService.connector.create.mockResolvedValue(expectedResult);

      const result = await service.create(tenantId, dto);

      expect(result.apiKey).toBeDefined();
      expect(result.apiKey).toMatch(/^vmc_/);
      expect(prisma.connector.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          type: ConnectorType.MINI,
          apiKeyHash: expect.any(String),
        }),
      });
    });
  });

  describe('findAll', () => {
    it('should return an array of connectors', async () => {
      const tenantId = 'tenant-1';
      const expectedResult = [{ id: '1', name: 'Test' }];
      mockPrismaService.connector.findMany.mockResolvedValue(expectedResult);

      const result = await service.findAll(tenantId, {});
      expect(result).toEqual(expectedResult);
      expect(prisma.connector.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
