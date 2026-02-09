import { Module, Global } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { CorrelationIdMiddleware } from './correlation-id.middleware';

@Global()
@Module({
  providers: [LoggerService, CorrelationIdMiddleware],
  exports: [LoggerService, CorrelationIdMiddleware],
})
export class LoggerModule {}
