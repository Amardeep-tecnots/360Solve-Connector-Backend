// Execution status workflow
export type ExecutionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSED'
  | 'CANCELLING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type ActivityExecutionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

// Activity execution context
export interface ActivityContext {
  executionId: string;
  tenantId: string;
  activityId: string;
  attempt: number;
  inputData: any;
  workflowDefinition: any;
}

// Execution event types
export interface ExecutionEvent {
  id?: string;
  executionId: string;
  timestamp: Date;
  eventType:
    | 'EXECUTION_STARTED'
    | 'STEP_STARTED'
    | 'STEP_COMPLETED'
    | 'STEP_FAILED'
    | 'ACTIVITY_RETRY'
    | 'EXECUTION_PAUSED'
    | 'EXECUTION_RESUMED'
    | 'EXECUTION_CANCELLED'
    | 'EXECUTION_COMPLETED';
  payload: Record<string, any>;
}

// DAG traversal state
export interface ExecutionState {
  currentStepId: string | null;
  completedSteps: string[];
  failedSteps: string[];
  stepOutputs: Record<string, any>;
  startedAt: Date;
  lastActivityAt: Date;
}
