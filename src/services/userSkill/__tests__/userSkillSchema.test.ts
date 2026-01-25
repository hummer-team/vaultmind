/**
 * @file userSkillSchema.test.ts
 * @description Unit tests for user skill zod schemas - security validation
 */

import { describe, it, expect } from 'bun:test';
import {
  filterExprSchema,
  metricDefinitionSchema,
  tableSkillConfigSchema,
  userSkillConfigSchema,
} from '../userSkillSchema';

describe('UserSkillSchema - Security Validation', () => {
  describe('filterExprSchema', () => {
    it('should accept valid filter', () => {
      const valid = {
        column: 'order_status',
        op: '=',
        value: 'completed',
      };
      expect(() => filterExprSchema.parse(valid)).not.toThrow();
    });

    it('should accept Chinese column names', () => {
      const valid = {
        column: '订单状态',
        op: '=',
        value: '已完成',
      };
      expect(() => filterExprSchema.parse(valid)).not.toThrow();
    });

    it('should reject SQL injection in column name', () => {
      const malicious = {
        column: "col'; DROP TABLE users; --",
        op: '=',
        value: 'test',
      };
      expect(() => filterExprSchema.parse(malicious)).toThrow();
    });

    it('should reject column with special characters', () => {
      const invalid = {
        column: 'col@name',
        op: '=',
        value: 'test',
      };
      expect(() => filterExprSchema.parse(invalid)).toThrow();
    });

    it('should reject excessively long strings', () => {
      const invalid = {
        column: 'status',
        op: '=',
        value: 'x'.repeat(1001),
      };
      expect(() => filterExprSchema.parse(invalid)).toThrow();
    });

    it('should reject large arrays', () => {
      const invalid = {
        column: 'id',
        op: 'in',
        value: Array(1001).fill('test'),
      };
      expect(() => filterExprSchema.parse(invalid)).toThrow();
    });

    it('should accept valid relative time', () => {
      const valid = {
        column: 'order_date',
        op: '>=',
        value: {
          kind: 'relative_time',
          unit: 'day',
          amount: 30,
          direction: 'past',
        },
      };
      expect(() => filterExprSchema.parse(valid)).not.toThrow();
    });

    it('should reject relative time with excessive amount', () => {
      const invalid = {
        column: 'order_date',
        op: '>=',
        value: {
          kind: 'relative_time',
          unit: 'day',
          amount: 10000, // More than 10 years
          direction: 'past',
        },
      };
      expect(() => filterExprSchema.parse(invalid)).toThrow();
    });
  });

  describe('metricDefinitionSchema', () => {
    it('should accept valid count metric', () => {
      const valid = {
        label: 'Total Orders',
        aggregation: 'count',
      };
      expect(() => metricDefinitionSchema.parse(valid)).not.toThrow();
    });

    it('should accept valid sum metric with column', () => {
      const valid = {
        label: 'GMV',
        aggregation: 'sum',
        column: 'amount',
      };
      expect(() => metricDefinitionSchema.parse(valid)).not.toThrow();
    });

    it('should reject sum without column', () => {
      const invalid = {
        label: 'GMV',
        aggregation: 'sum',
        // Missing column
      };
      expect(() => metricDefinitionSchema.parse(invalid)).toThrow();
    });

    it('should accept metric with WHERE filters', () => {
      const valid = {
        label: 'Completed Orders',
        aggregation: 'count',
        where: [
          {
            column: 'status',
            op: '=',
            value: 'completed',
          },
        ],
      };
      expect(() => metricDefinitionSchema.parse(valid)).not.toThrow();
    });

    it('should reject excessive WHERE filters', () => {
      const invalid = {
        label: 'Test Metric',
        aggregation: 'count',
        where: Array(11).fill({
          column: 'col',
          op: '=',
          value: 'val',
        }),
      };
      expect(() => metricDefinitionSchema.parse(invalid)).toThrow();
    });
  });

  describe('tableSkillConfigSchema', () => {
    it('should accept valid config', () => {
      const valid = {
        industry: 'ecommerce',
        fieldMapping: {
          orderIdColumn: 'order_id',
          timeColumn: 'order_date',
        },
        defaultFilters: [
          {
            column: 'status',
            op: '=',
            value: 'active',
          },
        ],
        metrics: {
          order_count: {
            label: 'Order Count',
            aggregation: 'count',
          },
        },
      };
      expect(() => tableSkillConfigSchema.parse(valid)).not.toThrow();
    });

    it('should reject excessive default filters', () => {
      const invalid = {
        industry: 'ecommerce',
        defaultFilters: Array(21).fill({
          column: 'col',
          op: '=',
          value: 'val',
        }),
      };
      expect(() => tableSkillConfigSchema.parse(invalid)).toThrow();
    });

    it('should reject excessive metrics', () => {
      const metrics: Record<string, unknown> = {};
      for (let i = 0; i < 51; i++) {
        metrics[`metric${i}`] = {
          label: `Metric ${i}`,
          aggregation: 'count',
        };
      }
      const invalid = { industry: 'ecommerce', metrics };
      expect(() => tableSkillConfigSchema.parse(invalid)).toThrow();
    });
  });

  describe('userSkillConfigSchema', () => {
    it('should accept valid config', () => {
      const valid = {
        version: 'v1',
        tables: {
          main_table_1: {
            industry: 'ecommerce',
            fieldMapping: {
              timeColumn: 'order_date',
            },
          },
        },
      };
      expect(() => userSkillConfigSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid version', () => {
      const invalid = {
        version: 'v2', // Only v1 supported
        tables: {},
      };
      expect(() => userSkillConfigSchema.parse(invalid)).toThrow();
    });

    it('should reject excessive tables', () => {
      const tables: Record<string, unknown> = {};
      for (let i = 0; i < 11; i++) {
        tables[`table${i}`] = { industry: 'ecommerce' };
      }
      const invalid = {
        version: 'v1',
        tables,
      };
      expect(() => userSkillConfigSchema.parse(invalid)).toThrow();
    });
  });
});
