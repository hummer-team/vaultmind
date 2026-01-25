/**
 * @file digestBuilder.test.ts
 * @description Unit tests for digest builder
 */

import { describe, it, expect } from 'bun:test';
import {
  buildTableSkillDigest,
  buildUserSkillDigest,
  getDigestStats,
  checkDigestBudget,
} from '../digestBuilder';
import type {
  TableSkillConfig,
  UserSkillConfig,
  FilterExpr,
  MetricDefinition,
} from '../../types';

describe('DigestBuilder', () => {
  describe('buildTableSkillDigest', () => {
    it('should build digest with all sections', () => {
      const tableConfig: TableSkillConfig = {
        industry: 'ecommerce',
        fieldMapping: {
          orderIdColumn: 'order_id',
          userIdColumn: 'user_id',
          timeColumn: 'order_date',
          amountColumn: 'total_amount',
        },
        defaultFilters: [
          { column: 'status', op: '=', value: 'completed' },
          { column: 'amount', op: '>', value: 0 },
        ],
        metrics: {
          gmv: {
            label: 'GMV',
            aggregation: 'sum',
            column: 'total_amount',
          },
        },
      };

      const digest = buildTableSkillDigest('main_table_1', tableConfig);

      expect(digest).toContain('Active table: main_table_1');
      expect(digest).toContain('Field mapping:');
      expect(digest).toContain('orderId: order_id');
      expect(digest).toContain('Default filters:');
      expect(digest).toContain('status = "completed"');
      expect(digest).toContain('Metrics overrides:');
      expect(digest).toContain('gmv: sum(total_amount)');
    });

    it('should handle empty config', () => {
      const tableConfig: TableSkillConfig = {
        industry: 'ecommerce',
      };
      const digest = buildTableSkillDigest('main_table_1', tableConfig);
      expect(digest).toBe('Active table: main_table_1');
    });

    it('should truncate filters with Top-N', () => {
      const filters: FilterExpr[] = [];
      for (let i = 0; i < 10; i++) {
        filters.push({ column: `col${i}`, op: '=', value: `val${i}` });
      }

      const tableConfig: TableSkillConfig = {
        industry: 'ecommerce',
        defaultFilters: filters,
      };

      const digest = buildTableSkillDigest('main_table_1', tableConfig, {
        maxFilters: 3,
      });

      expect(digest).toContain('col0');
      expect(digest).toContain('col1');
      expect(digest).toContain('col2');
      expect(digest).toContain('+7 more filters');
    });

    it('should truncate metrics with Top-K', () => {
      const metrics: Record<string, MetricDefinition> = {};
      for (let i = 0; i < 15; i++) {
        metrics[`metric${i}`] = {
          label: `Metric ${i}`,
          aggregation: 'count',
        };
      }

      const tableConfig: TableSkillConfig = {
        industry: 'ecommerce',
        metrics,
      };

      const digest = buildTableSkillDigest('main_table_1', tableConfig, {
        maxMetrics: 5,
      });

      expect(digest).toContain('metric0');
      expect(digest).toContain('metric4');
      expect(digest).toContain('+10 more metrics');
    });
  });

  describe('buildUserSkillDigest', () => {
    it('should build digest for active table', () => {
      const config: UserSkillConfig = {
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

      const digest = buildUserSkillDigest(config, 'main_table_1');
      expect(digest).toContain('Active table: main_table_1');
      expect(digest).toContain('time: order_date');
    });

    it('should return empty for null config', () => {
      const digest = buildUserSkillDigest(null, 'main_table_1');
      expect(digest).toBe('');
    });

    it('should return empty for missing table', () => {
      const config: UserSkillConfig = {
        version: 'v1',
        tables: {},
      };

      const digest = buildUserSkillDigest(config, 'main_table_1');
      expect(digest).toBe('');
    });

    it('should enforce budget (hard limit)', () => {
      // Create a config that will exceed budget
      const filters: FilterExpr[] = [];
      // Need more filters to exceed 500 chars even with Top-5 truncation
      for (let i = 0; i < 200; i++) {
        filters.push({ column: `very_long_column_name_with_extra_text_${i}`, op: '=', value: `very_long_value_that_will_cause_overflow_${i}` });
      }

      const config: UserSkillConfig = {
        version: 'v1',
        tables: {
          main_table_1: {
            industry: 'ecommerce',
            defaultFilters: filters,
          },
        },
      };

      const digest = buildUserSkillDigest(config, 'main_table_1', {
        budget: { schemaDigestMaxChars: 4000, userSkillDigestMaxChars: 200, systemSkillPackMaxChars: 2000 },
        maxFilters: 10, // Use more filters to create longer digest
      });

      // Should be truncated to budget + truncation message
      expect(digest.length).toBeLessThanOrEqual(220); // Allow for truncation message
      if (digest.length > 200) {
        expect(digest).toContain('truncated');
      }
    });
  });

  describe('getDigestStats', () => {
    it('should calculate stats correctly', () => {
      const digest = 'Line 1\nLine 2\nLine 3';
      const stats = getDigestStats(digest);
      expect(stats.chars).toBe(digest.length);
      expect(stats.lines).toBe(3);
    });
  });

  describe('checkDigestBudget', () => {
    it('should check budget correctly', () => {
      const digest = 'x'.repeat(1000);
      const result = checkDigestBudget(digest);
      expect(result.withinBudget).toBe(true);
      expect(result.chars).toBe(1000);
      expect(result.limit).toBe(1200);
    });

    it('should detect over-budget', () => {
      const digest = 'x'.repeat(1500);
      const result = checkDigestBudget(digest);
      expect(result.withinBudget).toBe(false);
      expect(result.chars).toBe(1500);
    });
  });
});
