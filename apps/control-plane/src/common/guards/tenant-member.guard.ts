import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class TenantMemberGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.tenantId || !user?.userId) {
      throw new ForbiddenException('User not authenticated');
    }

    // Verify user is still a member of the tenant
    const tenantUser = await this.prisma.user.findFirst({
      where: {
        id: user.userId,
        tenantId: user.tenantId,
      },
    });

    if (!tenantUser) {
      throw new ForbiddenException('User is not a member of this tenant');
    }

    return true;
  }
}
