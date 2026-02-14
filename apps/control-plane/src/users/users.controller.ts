import { Controller, Get, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../common/guards/tenant-member.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';

@ApiTags('Users')
@Controller('api/users')
@UseGuards(JwtAuthGuard, TenantMemberGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiResponse({ status: 200, type: [UserResponseDto] })
  async findAll(@TenantId() tenantId: string) {
    const users = await this.usersService.findAll(tenantId);
    return { success: true, data: users };
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: UserResponseDto })
  async findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    const user = await this.usersService.findOne(id, tenantId);
    return { success: true, data: user };
  }

  @Put(':id')
  @ApiResponse({ status: 200, type: UserResponseDto })
  async update(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() dto: UpdateUserDto,
  ) {
    const user = await this.usersService.update(id, tenantId, dto);
    return { success: true, data: user };
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Request() req: any,
  ) {
    await this.usersService.remove(id, tenantId, req.user.id);
    return { success: true };
  }
}
