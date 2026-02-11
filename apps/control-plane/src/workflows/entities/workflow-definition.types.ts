// Activity type discriminator
export type ActivityType = 'extract' | 'transform' | 'load' | 'filter' | 'join' | 'multi-extract' | 'multi-load' | 'sync';

// Base activity interface
export interface Activity {
  id: string;
  type: ActivityType;
  name: string;
  config: ActivityConfig;
}

// Activity-specific configurations
export interface ExtractConfig {
  aggregatorInstanceId: string;
  table: string;
  columns: string[];
  where?: string;
  limit?: number;
}

export interface TransformConfig {
  code: string;  // JavaScript function body
  inputSchema?: Record<string, string>;  // Optional type hints
}

export interface LoadConfig {
  aggregatorInstanceId: string;
  table: string;
  mode: 'insert' | 'upsert' | 'create';
  conflictKey?: string | string[];
  conflictResolution?: 'replace' | 'merge' | 'skip';
  columnMappings?: { source: string; destination: string }[];
}

export interface FilterConfig {
  condition: string;  // JavaScript expression returning boolean
  inputActivityId: string;  // Which activity's output to filter
}

export interface JoinConfig {
  leftActivityId: string;
  rightActivityId: string;
  joinType: 'inner' | 'left' | 'right';
  leftKey: string;
  rightKey: string;
}

export type ActivityConfig = 
  | ExtractConfig 
  | TransformConfig 
  | LoadConfig 
  | FilterConfig 
  | JoinConfig;

// DAG step definition
export interface WorkflowStep {
  id: string;
  activityId: string;
  dependsOn: string[];  // Step IDs this depends on
}

// Complete workflow definition
export interface WorkflowDefinition {
  version: '1.0';
  activities: Activity[];
  steps: WorkflowStep[];
  schedule?: string;  // Cron expression
}
