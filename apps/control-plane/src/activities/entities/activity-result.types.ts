export interface ActivityExecutionRequest {
  executionId: string;
  tenantId: string;
  activityId: string;
  stepId: string;
  activityType: 'extract' | 'transform' | 'load' | 'filter' | 'join';
  config: Record<string, any>;
  inputs?: Record<string, any>;
}

export interface ActivityExecutionResult {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
    retryable: boolean;
  };
  metadata?: {
    rowsProcessed?: number;
    rowsFiltered?: number;
    durationMs: number;
    bytesTransferred?: number;
    warnings?: string[];
  };
}

export interface ExecutionContext {
  executionId: string;
  tenantId: string;
  activityId: string;
  stepId: string;
  startTime: Date;
  timeout?: number;
  retryCount: number;
  maxRetries: number;
}
