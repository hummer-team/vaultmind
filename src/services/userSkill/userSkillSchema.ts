/**
 * @file userSkillSchema.ts
 * @description Zod schemas for validating User Skill L0 configurations.
 * These schemas enforce strict constraints to prevent SQL injection and ensure safe execution.
 */

import { z } from 'zod';

/**
 * Relative time value schema for time-based filters.
 */
export const relativeTimeValueSchema = z.object({
  kind: z.literal('relative_time'),
  unit: z.enum(['day', 'week', 'month', 'year']),
  amount: z.number().int().positive().max(3650), // Max 10 years
  direction: z.enum(['past', 'future']),
});

/**
 * Literal value schema (primitives only).
 */
export const literalValueSchema = z.union([
  z.string().max(1000), // Prevent excessively long strings
  z.number(),
  z.boolean(),
  z.array(z.union([z.string().max(500), z.number()])).max(1000), // Max 1000 items
]);

/**
 * Filter expression schema with restricted operators.
 */
export const filterExprSchema = z.object({
  column: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, {
    message: 'Column name must contain only letters, numbers, underscores, or Chinese characters',
  }),
  op: z.enum(['=', '!=', '>', '>=', '<', '<=', 'in', 'not_in', 'contains']),
  value: z.union([literalValueSchema, relativeTimeValueSchema]),
});

/**
 * Metric definition schema with restricted aggregation types.
 */
export const metricDefinitionSchema = z.object({
  label: z.string().min(1).max(100),
  aggregation: z.enum(['count', 'count_distinct', 'sum', 'avg', 'min', 'max']),
  column: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/).optional(),
  where: z.array(filterExprSchema).max(10).optional(), // Max 10 filters per metric
}).refine(
  (data) => {
    // 'count' doesn't require a column, but others do
    if (data.aggregation !== 'count' && !data.column) {
      return false;
    }
    return true;
  },
  {
    message: 'Column is required for aggregations other than "count"',
  }
);

/**
 * Field mapping schema for key column identification.
 */
export const fieldMappingSchema = z.object({
  orderIdColumn: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/).optional(),
  userIdColumn: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/).optional(),
  timeColumn: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/).optional(),
  amountColumn: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/).optional(),
});

/**
 * Table skill configuration schema.
 * Industry is table-level to support multi-domain analysis (e.g., ecommerce + finance).
 */
export const tableSkillConfigSchema = z.object({
  industry: z.string().min(1).max(50), // Required: determines which Skill Pack to load
  fieldMapping: fieldMappingSchema.optional(),
  defaultFilters: z.array(filterExprSchema).max(20).optional(), // Max 20 default filters
  metrics: z.record(z.string(), metricDefinitionSchema).optional(),
}).refine(
  (data) => {
    // If metrics defined, limit to 50 metrics per table
    if (data.metrics && Object.keys(data.metrics).length > 50) {
      return false;
    }
    return true;
  },
  {
    message: 'Maximum 50 metrics allowed per table',
  }
);

/**
 * User skill configuration schema (global).
 */
export const userSkillConfigSchema = z.object({
  version: z.literal('v1'),
  tables: z.record(z.string(), tableSkillConfigSchema),
}).refine(
  (data) => {
    // Limit to 10 tables max
    if (Object.keys(data.tables).length > 10) {
      return false;
    }
    return true;
  },
  {
    message: 'Maximum 10 tables allowed in user skill configuration',
  }
);

/**
 * Type inference from schemas.
 */
export type RelativeTimeValue = z.infer<typeof relativeTimeValueSchema>;
export type LiteralValue = z.infer<typeof literalValueSchema>;
export type FilterExpr = z.infer<typeof filterExprSchema>;
export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;
export type FieldMapping = z.infer<typeof fieldMappingSchema>;
export type TableSkillConfig = z.infer<typeof tableSkillConfigSchema>;
export type UserSkillConfig = z.infer<typeof userSkillConfigSchema>;
