import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConnectorsService } from '../connectors.service';

@Injectable()
export class ConnectorApiKeyGuard implements CanActivate {
  constructor(private readonly connectorsService: ConnectorsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = (request.headers['authorization'] as string | undefined) || '';

    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Missing connector API key');
    }

    const apiKey = authHeader.slice(7).trim();
    const validation = await this.connectorsService.validateApiKey(apiKey);

    if (!validation.valid || !validation.connectorId) {
      throw new UnauthorizedException('Invalid connector API key');
    }

    if (request.params?.id && request.params.id !== validation.connectorId) {
      throw new ForbiddenException('Connector ID mismatch');
    }

    request.connector = {
      id: validation.connectorId,
      tenantId: validation.tenantId,
      apiKey,
    };

    return true;
  }
}
