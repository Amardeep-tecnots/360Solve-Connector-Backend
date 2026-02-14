import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { LoggerModule, CorrelationIdMiddleware } from '@360solve/shared';
import { AuthModule } from './auth/auth.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { AggregatorsModule } from './aggregators/aggregators.module';
import { ExecutionsModule } from './executions/executions.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { PrismaService } from './prisma.service';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET') || 'fallback-secret-key-change-in-production',
        signOptions: { expiresIn: '1h' },
      }),
    }),
    LoggerModule,
    AuthModule,
    WorkflowsModule,
    AggregatorsModule,
    ExecutionsModule,
    ConnectorsModule,
    TenantsModule,
    UsersModule,
    WebsocketModule,
  ],
  providers: [PrismaService, LoggingInterceptor],
  exports: [PrismaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
