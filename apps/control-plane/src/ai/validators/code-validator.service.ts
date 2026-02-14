import { Injectable, Logger } from '@nestjs/common';

interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

@Injectable()
export class CodeValidatorService {
  private readonly logger = new Logger(CodeValidatorService.name);

  async validate(code: string): Promise<ValidationResult> {
    const errors: string[] = [];

    // Check for dangerous patterns
    const dangerousPatterns = [
      { pattern: /require\s*\(/, message: 'Direct require() calls are not allowed' },
      { pattern: /import\s+/, message: 'Import statements are not allowed' },
      { pattern: /eval\s*\(/, message: 'eval() calls are not allowed' },
      { pattern: /Function\s*\(/, message: 'Function() constructor is not allowed' },
      { pattern: /process\./, message: 'Process access is not allowed' },
      { pattern: /global\./, message: 'Global access is not allowed' },
      { pattern: /__dirname/, message: '__dirname access is not allowed' },
      { pattern: /__filename/, message: '__filename access is not allowed' },
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(code)) {
        errors.push(message);
      }
    }

    // Check for syntax errors
    try {
      new Function(code);
    } catch (error) {
      errors.push(`Syntax error: ${error.message}`);
    }

    // Check for suspicious operations
    if (code.includes('fs.') || code.includes('child_process.')) {
      errors.push('File system and child process operations are not allowed');
    }

    if (code.includes('exec(') || code.includes('spawn(')) {
      errors.push('Process execution is not allowed');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async validateTransformCode(code: string): Promise<ValidationResult> {
    const errors: string[] = [];

    // Basic validation
    const basicValidation = await this.validate(code);
    if (!basicValidation.valid) {
      return basicValidation;
    }

    // Check that code is a function
    if (!code.includes('return') && !code.includes('=>')) {
      errors.push('Transform code must return a value');
    }

    // Check for infinite loops
    if (code.includes('while (true)') || code.includes('for (;;)')) {
      errors.push('Infinite loops are not allowed');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
