import { Injectable, Logger } from '@nestjs/common';
import { DocumentationParserService } from './documentation-parser.service';
import { CodeGeneratorService } from './code-generator.service';
import { WasmCompilerService } from './wasm-compiler.service';
import { CodeValidatorService } from './validators/code-validator.service';

@Injectable()
export class SDKGeneratorService {
  private readonly logger = new Logger(SDKGeneratorService.name);

  constructor(
    private readonly docParser: DocumentationParserService,
    private readonly codeGenerator: CodeGeneratorService,
    private readonly wasmCompiler: WasmCompilerService,
    private readonly codeValidator: CodeValidatorService,
  ) {}

  async generateSDK(
    documentationUrl: string,
    options?: {
      language?: 'typescript' | 'python';
      includeExamples?: boolean;
      validateCode?: boolean;
    }
  ): Promise<{
    success: boolean;
    sdkCode?: string;
    wasmBinary?: string;
    errors?: string[];
  }> {
    try {
      this.logger.log(`Starting SDK generation for: ${documentationUrl}`);

      // Step 1: Parse documentation
      const parsedDocs = await this.docParser.parse(documentationUrl);
      if (!parsedDocs.success) {
        return {
          success: false,
          errors: parsedDocs.errors,
        };
      }

      this.logger.log(`Documentation parsed: ${parsedDocs.endpoints.length} endpoints found`);

      // Step 2: Generate TypeScript code
      const generatedCode = await this.codeGenerator.generate(parsedDocs);
      if (!generatedCode.success) {
        return {
          success: false,
          errors: generatedCode.errors,
        };
      }

      // Step 3: Validate generated code
      if (options?.validateCode !== false) {
        const validation = await this.codeValidator.validate(generatedCode.code);
        if (!validation.valid) {
          return {
            success: false,
            errors: validation.errors,
          };
        }
      }

      // Step 4: Compile to WASM
      const compiled = await this.wasmCompiler.compile(generatedCode.code);
      if (!compiled.success) {
        return {
          success: false,
          errors: compiled.errors,
        };
      }

      this.logger.log(`SDK generation completed successfully`);

      return {
        success: true,
        sdkCode: generatedCode.code,
        wasmBinary: compiled.wasmBinary,
      };

    } catch (error) {
      this.logger.error(`SDK generation failed: ${error.message}`, error.stack);
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  async generateSDKFromSchema(
    schema: any,
    options?: {
      language?: 'typescript' | 'python';
      includeExamples?: boolean;
    }
  ): Promise<{
    success: boolean;
    sdkCode?: string;
    wasmBinary?: string;
    errors?: string[];
  }> {
    try {
      this.logger.log(`Starting SDK generation from schema`);

      // Generate code directly from schema
      const generatedCode = await this.codeGenerator.generateFromSchema(schema);
      if (!generatedCode.success) {
        return {
          success: false,
          errors: generatedCode.errors,
        };
      }

      // Validate generated code
      const validation = await this.codeValidator.validate(generatedCode.code);
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors,
        };
      }

      // Compile to WASM
      const compiled = await this.wasmCompiler.compile(generatedCode.code);
      if (!compiled.success) {
        return {
          success: false,
          errors: compiled.errors,
        };
      }

      this.logger.log(`SDK generation from schema completed successfully`);

      return {
        success: true,
        sdkCode: generatedCode.code,
        wasmBinary: compiled.wasmBinary,
      };

    } catch (error) {
      this.logger.error(`SDK generation from schema failed: ${error.message}`, error.stack);
      return {
        success: false,
        errors: [error.message],
      };
    }
  }
}
