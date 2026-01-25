import type { Attachment } from '../../../types/workbench.types';
import type { ExecuteQueryFunc } from '../agentExecutor';
import type { LLMConfig } from '../llmClient';
import { z } from 'zod';

export const skillStopReasonSchema = z.enum([
  'SUCCESS',
  'NEED_CLARIFICATION',
  'BUDGET_EXCEEDED',
  'POLICY_DENIED',
  'TOOL_ERROR',
  'CANCELLED',
  'UNKNOWN',
]);

export type SkillStopReason = z.infer<typeof skillStopReasonSchema>;

export interface SkillRuntime {
  llmConfig: LLMConfig;
  executeQuery: ExecuteQueryFunc;
  signal?: AbortSignal;
}

export interface SkillContext {
  userInput: string;
  attachments: Attachment[];
  personaId?: string;
  sessionId?: string;
  /** A compact schema digest to help the skill pick columns/tables. */
  schemaDigest: string;
  /** max rows expected in result rendering (UI constraint). */
  maxRows: number;
  runtime: SkillRuntime;
  /** Industry identifier for loading System Skill Pack (M10.4 Phase 2) */
  industry?: string;
  /** User skill configuration (M10.4 Phase 3) */
  userSkillConfig?: UserSkillConfig;
  /** Active table name for current analysis (M10.4 Phase 3) */
  activeTable?: string;
}

export interface SkillResult {
  stopReason: SkillStopReason;
  message?: string;
  tool?: string;
  params?: unknown;
  result?: unknown;
  schema?: unknown[];
  thought?: string;
  llmDurationMs?: number;
  queryDurationMs?: number;
  cancelled?: boolean;
}

export interface SkillDefinition {
  /** e.g. "analysis.v1" */
  id: string;
  description: string;
  run(context: SkillContext): Promise<SkillResult>;
}

// --- User Skill L0 Types ---

/**
 * Relative time value for time-based filters.
 * Example: { kind: 'relative_time', unit: 'day', amount: 30, direction: 'past' } represents "last 30 days"
 */
export interface RelativeTimeValue {
  kind: 'relative_time';
  unit: 'day' | 'week' | 'month' | 'year';
  amount: number;
  direction: 'past' | 'future';
}

/**
 * Literal value for filters (string, number, boolean, or array of primitives).
 */
export type LiteralValue = string | number | boolean | Array<string | number>;

/**
 * Filter expression with restricted operators to prevent SQL injection.
 * Supports both literal values and relative time expressions.
 */
export interface FilterExpr {
  column: string;
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'not_in' | 'contains';
  value: LiteralValue | RelativeTimeValue;
}

/**
 * Metric definition with restricted aggregation types.
 * Supports count, count_distinct, sum, avg with optional where clause.
 */
export interface MetricDefinition {
  label: string;
  aggregation: 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max';
  column?: string; // Optional for 'count', required for others
  where?: FilterExpr[];
}

/**
 * Field mapping for a table to help LLM identify key columns.
 */
export interface FieldMapping {
  orderIdColumn?: string;
  userIdColumn?: string;
  timeColumn?: string;
  amountColumn?: string;
}

/**
 * User skill configuration for a single table.
 * Industry is table-level to support multi-domain analysis.
 */
export interface TableSkillConfig {
  industry: string; // e.g., 'ecommerce', 'finance', 'retail'
  fieldMapping?: FieldMapping;
  defaultFilters?: FilterExpr[];
  metrics?: Record<string, MetricDefinition>; // key: metric name, e.g., "gmv"
}

/**
 * User skill configuration (global, stored in Chrome storage).
 * Indexed by table name from attachments snapshot.
 */
export interface UserSkillConfig {
  version: 'v1';
  tables: Record<string, TableSkillConfig>; // key: tableName, e.g., "main_table_1"
}

/**
 * Digest budget constraints for prompt injection.
 */
export interface DigestBudget {
  schemaDigestMaxChars: number;
  userSkillDigestMaxChars: number;
  systemSkillPackMaxChars: number;
}

/**
 * Default digest budget (can be overridden in config).
 */
export const DEFAULT_DIGEST_BUDGET: DigestBudget = {
  schemaDigestMaxChars: 4000,
  userSkillDigestMaxChars: 1200,
  systemSkillPackMaxChars: 2000,
};
