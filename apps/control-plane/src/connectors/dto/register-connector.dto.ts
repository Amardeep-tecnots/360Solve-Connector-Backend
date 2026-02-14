import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterConnectorDto {
  @ApiProperty({ description: 'API Key for registration' })
  @IsString()
  @IsNotEmpty()
  apiKey: string;
}
