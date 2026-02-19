import { Injectable, Logger } from '@nestjs/common';
import * as ts from 'typescript';
import * as vm from 'vm2';

interface CompiledWASM {
  success: boolean;
  /** Compiled JavaScript code (can be executed in WASM runtime) */
  jsCode?: string;
  /** WASM binary (if actual WASM compilation is enabled) */
  wasmBinary?: Buffer | null;
  /** Extracted methods from the SDK */
  methods?: SDKMethod[];
  errors?: string[];
}

export interface SDKMethod {
  name: string;
  parameters: string[];
  returnType: string;
  description?: string;
}

@Injectable()
export class WasmCompilerService {
  private readonly logger = new Logger(WasmCompilerService.name);

  /**
   * Compile TypeScript SDK code to JavaScript/WASM
   * 
   * Process:
   * 1. Transpile TypeScript to JavaScript
   * 2. Extract SDK methods for runtime invocation
   * 3. (Optional) Compile to actual WASM using QuickJS
   */
  async compile(code: string): Promise<CompiledWASM> {
    try {
      this.logger.log(`Compiling TypeScript SDK to executable format`);

      // Step 1: Transpile TypeScript to JavaScript
      const transpiled = this.transpileTypeScript(code);
      if (!transpiled.success) {
        return transpiled;
      }

      // Step 2: Extract methods from the code for runtime invocation
      const methods = this.extractMethods(code);

      // Step 3: For now, return the transpiled JS
      // WASM compilation can be added later with QuickJS
      // The JS code can be executed in a sandboxed VM2 environment
      
      this.logger.log(`SDK compilation completed. Extracted ${methods.length} methods`);

      return {
        success: true,
        jsCode: transpiled.jsCode,
        wasmBinary: null, // TODO: Add QuickJS WASM compilation
        methods,
      };

    } catch (error: any) {
      this.logger.error(`WASM compilation failed: ${error.message}`, error.stack);
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  /**
   * Transpile TypeScript code to JavaScript
   */
  private transpileTypeScript(code: string): { success: boolean; jsCode?: string; errors?: string[] } {
    try {
      // Clean the code first - remove markdown code blocks if present
      let cleanCode = code.trim();
      if (cleanCode.startsWith('```')) {
        const firstNewline = cleanCode.indexOf('\n');
        const langEnd = cleanCode.indexOf('```', firstNewline + 1);
        if (langEnd > firstNewline) {
          cleanCode = cleanCode.slice(langEnd + 3);
        }
      }
      if (cleanCode.endsWith('```')) {
        cleanCode = cleanCode.slice(0, -3);
      }
      cleanCode = cleanCode.trim();

      // Transpile TypeScript to JavaScript
      const result = ts.transpileModule(cleanCode, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          strict: false,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: false,
        },
      });

      if (result.diagnostics && result.diagnostics.length > 0) {
        const errors = result.diagnostics.map(d => 
          d.messageText?.toString() || 'Unknown TypeScript error'
        );
        this.logger.warn(`TypeScript transpilation warnings: ${errors.join(', ')}`);
      }

      return {
        success: true,
        jsCode: result.outputText,
      };

    } catch (error: any) {
      this.logger.error(`TypeScript transpilation failed: ${error.message}`);
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  /**
   * Extract SDK methods from TypeScript code for runtime invocation
   */
  private extractMethods(code: string): SDKMethod[] {
    const methods: SDKMethod[] = [];

    // Clean the code
    let cleanCode = code.trim();
    if (cleanCode.startsWith('```')) {
      const firstNewline = cleanCode.indexOf('\n');
      const langEnd = cleanCode.indexOf('```', firstNewline + 1);
      if (langEnd > firstNewline) {
        cleanCode = cleanCode.slice(langEnd + 3);
      }
    }
    if (cleanCode.endsWith('```')) {
      cleanCode = cleanCode.slice(0, -3);
    }
    cleanCode = cleanCode.trim();

    // Use regex to find method definitions
    // Match: async methodName(params): Promise<ReturnType> { ... }
    const methodPattern = /(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*Promise<([^>]+)>|\s*:\s*([^;\n{]+))?\s*\{/g;
    
    let match;
    while ((match = methodPattern.exec(cleanCode)) !== null) {
      const methodName = match[1];
      
      // Skip constructor and private methods
      if (methodName === 'constructor' || methodName.startsWith('_')) {
        continue;
      }

      const params = match[2] ? match[2].split(',').map(p => p.trim()).filter(p => p) : [];
      const returnType = match[3] || match[4] || 'any';

      methods.push({
        name: methodName,
        parameters: params.map(p => p.split(':')[0].trim()),
        returnType: returnType.trim(),
      });
    }

    return methods;
  }

  /**
   * Validate that compiled code is safe to execute
   */
  validateCode(code: string): { valid: boolean; errors?: string[] } {
    const dangerousPatterns = [
      /process\.exit/,
      /require\s*\(\s*['"]child_process/,
      /require\s*\(\s*['"]fs/,
      /\beval\s*\(/,
      /\bFunction\s*\(/,
      /__dirname/,
      /__filename/,
    ];

    const errors: string[] = [];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        errors.push(`Dangerous pattern detected: ${pattern.source}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
