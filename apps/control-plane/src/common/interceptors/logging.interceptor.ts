import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger as NestLogger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { LoggerService } from '@360solve/shared';

interface RequestWithContext extends Request {
  correlationId?: string;
  startTime?: number;
  user?: { id: string; tenantId: string };
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly nestLogger = new NestLogger(LoggingInterceptor.name);

  constructor(private logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const response = context.switchToHttp().getResponse();
    const { method, url, headers, body, ip } = request;
    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;

    const startTime = Date.now();
    const correlationId = request.correlationId || this.logger.generateCorrelationId();
    const userId = request.user?.id;
    const tenantId = headers['x-tenant-id'] as string || request.user?.tenantId;

    // Set logger context for this request
    this.logger.setContext({
      correlationId,
      tenantId,
      userId,
    });

    // Log request
    this.logger.http('Incoming request', {
      method,
      path: url,
      controller: controllerName,
      handler: handlerName,
      ip,
      userAgent: headers['user-agent'],
      contentLength: headers['content-length'],
      // Don't log sensitive body data in production
      body: process.env.NODE_ENV === 'development' ? this.sanitizeBody(body) : undefined,
    });

    return next.handle().pipe(
      tap({
        next: (data: unknown) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          // Log successful response
          this.logger.logRequest(method, url, statusCode, duration, {
            controller: controllerName,
            handler: handlerName,
            responseSize: this.getResponseSize(data),
          });

          this.logger.debug('Response data', {
            controller: controllerName,
            handler: handlerName,
            data: process.env.NODE_ENV === 'development' ? data : undefined,
          });
        },
        error: (error: Error) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode || 500;

          // Log error
          this.logger.error('Request failed', error, {
            method,
            path: url,
            controller: controllerName,
            handler: handlerName,
            statusCode,
            duration,
            correlationId,
            tenantId,
            userId,
          });
        },
      }),
    );
  }

  private sanitizeBody(body: unknown): unknown {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authorization', 'creditCard'];
    const sanitized = { ...body as Record<string, unknown> };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private getResponseSize(data: unknown): number {
    try {
      return JSON.stringify(data).length;
    } catch {
      return 0;
    }
  }
}
