import { IsString } from 'class-validator';

export class ValidateApiKeyDto {
  @IsString()
  apiKey: string;
}
