import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';
import { SignUpDto, SignInDto } from './dto/auth.dto';
import { TenantTier } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async signUp(dto: SignUpDto) {
    // Check if email already exists
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Create tenant and user in transaction
    const result = await this.prisma.$transaction(async (prisma) => {
      // Create tenant
      const tenant = await prisma.tenant.create({
        data: {
          name: dto.companyName,
          tier: (dto.tier?.toUpperCase() as TenantTier) || TenantTier.FREE,
          maxConcurrentWorkflows: dto.tier === 'enterprise' ? 50 : dto.tier === 'standard' ? 20 : 5,
          maxJobsPerHour: dto.tier === 'enterprise' ? 10000 : dto.tier === 'standard' ? 1000 : 100,
          maxConcurrentJobs: dto.tier === 'enterprise' ? 10 : dto.tier === 'standard' ? 5 : 2,
          maxStorageGB: dto.tier === 'enterprise' ? 100 : dto.tier === 'standard' ? 20 : 5,
        },
      });

      // Create user
      const user = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          password: hashedPassword,
          name: dto.name,
          role: 'ADMIN',
        },
      });

      return { tenant, user };
    });

    // Generate tokens
    const tokens = await this.generateTokens(result.user.id, result.user.email, result.tenant.id, result.user.role);

    return {
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          tenantId: result.tenant.id,
          role: result.user.role,
        },
        tokens,
      },
    };
  }

  async signIn(dto: SignInDto) {
    // Find user by email
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.tenantId, user.role);

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          role: user.role,
        },
        tokens,
      },
    };
  }

  async refresh(refreshToken: string) {
    try {
      // Verify refresh token
      const payload = this.jwtService.verify(refreshToken);
      
      // Check if token exists in database
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
      });

      if (!storedToken || storedToken.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Get user
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user.id, user.email, user.tenantId, user.role);

      // Delete old refresh token
      await this.prisma.refreshToken.delete({
        where: { token: refreshToken },
      });

      return {
        success: true,
        data: tokens,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async generateTokens(userId: string, email: string, tenantId: string, role: string) {
    const payload = { sub: userId, email, tenantId, role };
    
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '1h',
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
      secret: this.config.get('JWT_REFRESH_SECRET') || this.config.get('JWT_SECRET'),
    });

    // Store refresh token
    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
    };
  }
}
