import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignUpDto {
  @ApiProperty({ example: 'user@company.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  companyName: string;

  @ApiProperty({ example: 'free', enum: ['free', 'standard', 'enterprise'] })
  @IsOptional()
  @IsEnum(['free', 'standard', 'enterprise'])
  tier?: string;
}

export class SignInDto {
  @ApiProperty({ example: 'user@company.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  password: string;

  @ApiProperty({ example: false })
  @IsOptional()
  rememberMe?: boolean;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}
