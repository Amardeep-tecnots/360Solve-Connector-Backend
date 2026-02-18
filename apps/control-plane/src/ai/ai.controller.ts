import { Controller, Post, Get, Body, Param, Res, HttpStatus, UseGuards, ValidationPipe, UsePipes } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { AIProviderService, AIProvider, GenerateSDKRequest, GenerateWorkflowRequest, GenerateSchemaMappingRequest } from './ai-provider.service';
import { SDKGeneratorService } from './sdk-generator.service';
import { WorkflowGeneratorService } from './workflow-generator.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ApiTags('AI')
@Controller('ai')
// @UseGuards(JwtAuthGuard)
// @ApiBearerAuth()
export class AIController {
  constructor(
    private readonly aiProvider: AIProviderService,
    private readonly sdkGenerator: SDKGeneratorService,
    private readonly workflowGenerator: WorkflowGeneratorService,
  ) {}

  /**
   * Get available AI providers and models
   */
  @Get('providers')
  @ApiOperation({ summary: 'Get available AI providers and models' })
  @ApiResponse({ status: 200, description: 'List of available providers' })
  getProviders() {
    return {
      success: true,
      data: this.aiProvider.getSupportedProviders(),
    };
  }

  /**
   * Get models for a specific provider
   */
  @Get('models/:provider')
  @ApiOperation({ summary: 'Get models for a specific provider' })
  @ApiResponse({ status: 200, description: 'List of models' })
  getModels(@Param('provider') provider: string) {
    const providerEnum = provider.toUpperCase() as AIProvider;
    return {
      success: true,
      data: {
        provider: providerEnum,
        models: this.aiProvider.getAvailableModels(providerEnum),
      },
    };
  }

  /**
   * Generate SDK from OpenAPI spec
   */
  @Post('generate-sdk')
  @ApiOperation({ summary: 'Generate TypeScript SDK from OpenAPI specification' })
  @ApiResponse({ status: 201, description: 'SDK generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async generateSDK(@Body() request: GenerateSDKRequest) {
    const result = await this.sdkGenerator.generateSDK(request);
    return {
      success: result.success,
      data: result.success ? {
        sdkId: result.sdkId,
        code: result.code,
        wasmBinary: result.wasmBinary,
      } : undefined,
      errors: result.errors,
    };
  }

  /**
   * Get generated SDK
   */
  @Get('sdk/:id')
  @ApiOperation({ summary: 'Get generated SDK by ID' })
  @ApiResponse({ status: 200, description: 'SDK details' })
  @ApiResponse({ status: 404, description: 'SDK not found' })
  async getSDK(@Param('id') id: string) {
    const sdk = await this.sdkGenerator.getSDK(id);
    if (!sdk) {
      return {
        success: false,
        error: { message: 'SDK not found' },
      };
    }
    return {
      success: true,
      data: sdk,
    };
  }

  /**
   * List all generated SDKs
   */
  @Get('sdks')
  @ApiOperation({ summary: 'List all generated SDKs' })
  @ApiResponse({ status: 200, description: 'List of SDKs' })
  async listSDKs() {
    const sdks = await this.sdkGenerator.listSDKs();
    return {
      success: true,
      data: sdks,
    };
  }

  /**
   * Download SDK code
   */
  @Get('sdk/:id/download')
  @ApiOperation({ summary: 'Download SDK source code' })
  @ApiResponse({ status: 200, description: 'SDK code file' })
  async downloadSDK(@Param('id') id: string, @Res() res: Response) {
    const sdk = await this.sdkGenerator.getSDK(id);
    if (!sdk) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        error: { message: 'SDK not found' },
      });
      return;
    }

    res.setHeader('Content-Type', 'text/typescript');
    res.setHeader('Content-Disposition', `attachment; filename="${sdk.name}.ts"`);
    res.send(sdk.code);
  }

  /**
   * Generate workflow from description
   */
  @Post('generate-workflow')
  @ApiOperation({ summary: 'Generate workflow from natural language description' })
  @ApiResponse({ status: 201, description: 'Workflow generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async generateWorkflow(@Body() request: GenerateWorkflowRequest) {
    const result = await this.workflowGenerator.generateWorkflow(request);
    return {
      success: result.success,
      data: result.workflow,
      errors: result.errors,
    };
  }

  /**
   * Generate schema mapping
   */
  @Post('generate-mapping')
  @ApiOperation({ summary: 'Generate schema mapping between source and destination' })
  @ApiResponse({ status: 201, description: 'Mapping generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async generateMapping(@Body() request: GenerateSchemaMappingRequest) {
    const result = await this.workflowGenerator.generateSchemaMapping(request);
    return {
      success: result.success,
      data: result.mapping,
      errors: result.errors,
    };
  }

  /**
   * Test AI completion (sandbox endpoint)
   */
  @Post('test')
  @ApiOperation({ summary: 'Test AI completion' })
  @ApiResponse({ status: 200, description: 'AI response' })
  async testAI(@Body() body: { prompt: string; model?: string }) {
    const response = await this.aiProvider.completeText(
      body.prompt,
      'You are a helpful assistant.',
      {
        model: body.model,
        temperature: 0.7,
        maxTokens: 500,
      }
    );

    return {
      success: true,
      data: { response },
    };
  }
}
