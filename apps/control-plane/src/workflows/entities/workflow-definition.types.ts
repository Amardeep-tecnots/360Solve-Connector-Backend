// Activity type discriminator
export type ActivityType = 
  | 'extract' 
  | 'transform' 
  | 'load' 
  | 'filter' 
  | 'join' 
  | 'multi-extract' 
  | 'multi-load' 
  | 'sync'
  | 'mini-connector-source'
  | 'cloud-connector-source'
  | 'cloud-connector-sink';

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

export interface MiniConnectorSourceConfig {
  connectorId: string;
  database: string;
  table: string;
  columns: string[];
  where?: string;
  limit?: number;
}

export interface CloudConnectorSourceConfig {
  aggregatorInstanceId: string;
  resource: string;
  operation: 'query' | 'scan';
  query?: string;
}

export interface CloudConnectorSinkConfig {
  aggregatorInstanceId: string;
  resource: string;
  mode: 'insert' | 'upsert' | 'update';
  batchSize?: number;
}

export interface TransformConfig {
  code: string;  // JavaScript function body
  inputSchema?: Record<string, string>;  // Optional type hints
}

export interface LoadConfig {
  aggregatorInstanceId: string;
  table?: string;  // Optional - can be inferred from sourceMetadata
  mode: 'insert' | 'upsert' | 'create';
  conflictKey?: string | string[];
  conflictResolution?: 'replace' | 'merge' | 'skip';
  columnMappings?: { source: string; destination: string }[];
  /**
   * Source metadata to infer table name when not explicitly provided.
   * This enables automatic table name resolution from source activity.
   */
  sourceMetadata?: {
    /** The table name from the source activity */
    tableName?: string;
    /** Original column names from source */
    columns?: string[];
    /** Schema information from source */
    schema?: Record<string, string>;
  };
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
  | JoinConfig
  | MiniConnectorSourceConfig
  | CloudConnectorSourceConfig
  | CloudConnectorSinkConfig;

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
