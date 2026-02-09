import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const TenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user?.tenantId) {
      throw new Error('TenantId not found in JWT payload');
    }
    
    return user.tenantId;
  },
);
