import { Injectable, Logger } from '@nestjs/common';
import { VM } from 'vm2';

interface TransformContext {
  executionId: string;
  activityId: string;
}

@Injectable()
export class DataTransformService {
  private readonly logger = new Logger(DataTransformService.name);

  async transform(
    data: any[],
    code: string,
    context: TransformContext
  ): Promise<any> {
    // Create secure VM for JavaScript execution
    const vm = new VM({
      timeout: 30000, // 30 second timeout
      sandbox: {
        data: data,
        console: {
          log: (...args) => this.logger.log(`[${context.executionId}]`, ...args),
          warn: (...args) => this.logger.warn(`[${context.executionId}]`, ...args),
          error: (...args) => this.logger.error(`[${context.executionId}]`, ...args),
        },
        // Helper functions
        moment: require('moment'),
        lodash: require('lodash'),
        // Read-only access to context
        context: { ...context },
      },
    });

    try {
      // Wrap user code in a function
      const wrappedCode = `
        (function(data) {
          ${code}
        })(data)
      `;

      const result = vm.run(wrappedCode);
      return result;

    } catch (error) {
      throw new Error(`Transform execution failed: ${error.message}`);
    }
  }

  async validateTransformCode(code: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // Basic syntax validation
      new Function(code);
      
      // Check for dangerous operations
      const dangerousPatterns = [
        /require\s*\(/,
        /import\s+/,
        /eval\s*\(/,
        /Function\s*\(/,
        /process\./,
        /global\./,
        /__dirname/,
        /__filename/,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(code)) {
          return {
            valid: false,
            error: `Dangerous operation detected: ${pattern.source}`,
          };
        }
      }

      return { valid: true };

    } catch (error) {
      return {
        valid: false,
        error: `Syntax error: ${error.message}`,
      };
    }
  }
}
