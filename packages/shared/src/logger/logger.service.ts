import { createLogger, format, transports, Logger, Logform } from 'winston';
import { v4 as uuidv4 } from 'uuid';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  SILLY = 'silly',
}

export interface LogContext {
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface StructuredLog {
  timestamp: string;
  level: string;
  message: string;
  service: string;
  environment: string;
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  duration?: number;
  path?: string;
  method?: string;
  statusCode?: number;
  error?: unknown;
  metadata?: Record<string, unknown>;
}

export class LoggerService {
  private logger: Logger;
  private context: LogContext = {};

  constructor(private serviceName: string = '360solve-connector') {
    const env = process.env.NODE_ENV || 'development';
    const logLevel = (process.env.LOG_LEVEL as LogLevel) || this.getDefaultLogLevel(env);

    this.logger = createLogger({
      level: logLevel,
      defaultMeta: {
        service: serviceName,
        environment: env,
      },
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        format.errors({ stack: true }),
        format.json(),
      ),
      transports: this.getTransports(env),
    });
  }

  private getDefaultLogLevel(env: string): LogLevel {
    switch (env) {
      case 'production':
        return LogLevel.INFO;
      case 'staging':
        return LogLevel.HTTP;
      default:
        return LogLevel.DEBUG;
    }
  }

  private getTransports(env: string): transports.ConsoleTransportInstance[] {
    const consoleTransport = new transports.Console({
      format: env === 'development'
        ? format.combine(
            format.colorize(),
            format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            format.printf((info: Logform.TransformableInfo) => {
              const { level, message, timestamp, ...metadata } = info;
              const metaStr = Object.keys(metadata).length > 2
                ? '\n' + JSON.stringify(metadata, null, 2)
                : '';
              return `${timestamp} [${level}]: ${message}${metaStr}`;
            }),
          )
        : undefined,
    });

    return [consoleTransport];
  }

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  generateCorrelationId(): string {
    return uuidv4();
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    error?: unknown,
  ): StructuredLog {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.serviceName,
      environment: process.env.NODE_ENV || 'development',
      ...this.context,
      ...metadata,
      error: error instanceof Error
        ? { message: error.message, stack: error.stack, name: error.name }
        : error,
    };
  }

  error(message: string, error?: unknown, metadata?: Record<string, unknown>): void {
    this.logger.error(this.createLogEntry(LogLevel.ERROR, message, metadata, error));
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.logger.warn(this.createLogEntry(LogLevel.WARN, message, metadata));
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.logger.info(this.createLogEntry(LogLevel.INFO, message, metadata));
  }

  http(message: string, metadata?: Record<string, unknown>): void {
    this.logger.http(this.createLogEntry(LogLevel.HTTP, message, metadata));
  }

  verbose(message: string, metadata?: Record<string, unknown>): void {
    this.logger.verbose(this.createLogEntry(LogLevel.VERBOSE, message, metadata));
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.logger.debug(this.createLogEntry(LogLevel.DEBUG, message, metadata));
  }

  // NestJS LoggerService compatibility - required by app.useLogger()
  log(message: string, metadata?: Record<string, unknown>): void {
    this.logger.info(this.createLogEntry(LogLevel.INFO, message, metadata));
  }

  silly(message: string, metadata?: Record<string, unknown>): void {
    this.logger.silly(this.createLogEntry(LogLevel.SILLY, message, metadata));
  }

  logRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    metadata?: Record<string, unknown>,
  ): void {
    const logLevel = statusCode >= 400 ? LogLevel.WARN : LogLevel.HTTP;
    const message = `${method} ${path} ${statusCode} - ${duration}ms`;

    this.logger.log(logLevel, this.createLogEntry(logLevel, message, {
      method,
      path,
      statusCode,
      duration,
      ...metadata,
    }));
  }
}

export const logger = new LoggerService();

