import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LoggerService } from './logger.service';

export interface RequestWithCorrelationId extends Request {
  correlationId: string;
  startTime: number;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private logger: LoggerService) {}

  use(req: RequestWithCorrelationId, res: Response, next: NextFunction): void {
    const correlationId = req.headers['x-correlation-id'] as string || this.logger.generateCorrelationId();
    
    req.correlationId = correlationId;
    req.startTime = Date.now();

    // Set correlation ID in response headers
    res.setHeader('X-Correlation-Id', correlationId);

    // Set in logger context
    this.logger.setContext({
      correlationId,
      requestId: req.headers['x-request-id'] as string,
    });

    next();
  }
}
