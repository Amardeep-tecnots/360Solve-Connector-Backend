import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../prisma.service';

describe('TenantsService', () => {
  let service: TenantsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should return a tenant', async () => {
      const tenant = { id: '1', name: 'Test Tenant' };
      mockPrismaService.tenant.findUnique.mockResolvedValue(tenant);

      const result = await service.findOne('1');
      expect(result).toEqual(tenant);
    });
  });
});
