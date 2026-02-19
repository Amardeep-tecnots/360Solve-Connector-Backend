import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AIProviderService } from './ai-provider.service';
import { DocumentationParserService } from './documentation-parser.service';
import { CodeGeneratorService } from './code-generator.service';
import { WasmCompilerService } from './wasm-compiler.service';
import { CodeValidatorService } from './validators/code-validator.service';
import { SDKGeneratorService } from './sdk-generator.service';
import { SDKExecutionService } from './sdk-execution.service';
import { WorkflowGeneratorService } from './workflow-generator.service';
import { AIController } from './ai.controller';
import { StorageModule } from '../storage/storage.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule, StorageModule],
  controllers: [AIController],
  providers: [
    AIProviderService,
    DocumentationParserService,
    CodeGeneratorService,
    WasmCompilerService,
    CodeValidatorService,
    SDKGeneratorService,
    SDKExecutionService,
    WorkflowGeneratorService,
    PrismaService,
  ],
  exports: [
    AIProviderService,
    SDKGeneratorService,
    SDKExecutionService,
    WorkflowGeneratorService,
  ],
})
export class AIModule {}
