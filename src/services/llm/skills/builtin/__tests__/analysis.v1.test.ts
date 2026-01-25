/**
 * Analysis.v1 Skill Tests - M10.4 Phase 3
 * Tests Query Type Router integration, Field Mapping, and Default Filters
 */

import { describe, test, expect } from 'bun:test';
import { analysisV1Skill } from '../analysis.v1';
import type { SkillContext, UserSkillConfig } from '../../types';
import type { LLMConfig } from '../../../llmClient';

describe('analysis.v1 Skill - M10.4 Phase 3', () => {
  const mockLLMConfig: LLMConfig = {
    provider: 'openai',
    apiKey: 'test-key',
    baseURL: 'https://api.openai.com/v1',
    modelName: 'gpt-4',
    mockEnabled: true, // Enable mock to avoid real LLM calls
  };

  const mockExecuteQuery = async () => {
    return {
      data: [{ count: 100 }],
      schema: [{ name: 'count', type: 'INTEGER' }],
    };
  };

  const mockUserSkillConfig: UserSkillConfig = {
    version: 'v1',
    tables: {
      orders: {
        industry: 'ecommerce',
        fieldMapping: {
          orderIdColumn: 'order_id',
          userIdColumn: 'user_id',
          timeColumn: 'order_time',
          amountColumn: 'amount',
        },
        defaultFilters: [
          {
            column: 'status',
            op: '=',
            value: 'completed',
          },
        ],
      },
    },
  };

  const createMockContext = (
    userInput: string,
    overrides?: Partial<SkillContext>
  ): SkillContext => {
    return {
      userInput,
      attachments: [],
      schemaDigest: 'Table: orders (order_id, user_id, order_time, amount, status)',
      maxRows: 100,
      runtime: {
        llmConfig: mockLLMConfig,
        executeQuery: mockExecuteQuery,
      },
      ...overrides,
    };
  };

  describe('Query Type Router Integration', () => {
    test('should classify kpi_single query correctly', async () => {
      // Use explicit keywords to ensure high confidence (avoid LLM call)
      const ctx = createMockContext('统计订单总数是多少');
      const result = await analysisV1Skill.run(ctx);

      if (result.stopReason !== 'SUCCESS') {
        console.log('[TEST] Failed result:', result);
      }
      expect(result.stopReason).toBe('SUCCESS');
      expect(result.tool).toBe('sql_query_tool');
      expect(result.params).toHaveProperty('query');
      const query = (result.params as { query: string }).query;
      expect(query).toContain('SELECT COUNT(*)');
    });

    test('should classify trend_time query correctly', async () => {
      // Use explicit keywords to ensure high confidence
      const ctx = createMockContext('显示订单按天趋势', {
        userSkillConfig: mockUserSkillConfig,
        activeTable: 'orders',
      });
      const result = await analysisV1Skill.run(ctx);

      expect(result.stopReason).toBe('SUCCESS');
      const query = (result.params as { query: string }).query;
      expect(query).toContain('DATE_TRUNC');
      expect(query).toContain('order_time'); // Should use field mapping
    });

    test('should classify kpi_grouped query correctly', async () => {
      // Use explicit keywords to ensure high confidence
      const ctx = createMockContext('按地区统计订单数量', {
        schemaDigest: 'Table: orders (order_id, region, amount)',
      });
      const result = await analysisV1Skill.run(ctx);

      expect(result.stopReason).toBe('SUCCESS');
      const query = (result.params as { query: string }).query;
      expect(query).toContain('GROUP BY');
    });
  });

  describe('Field Mapping Support', () => {
    test('should use fieldMapping.timeColumn when available', async () => {
      const ctx = createMockContext('最近30天订单按天趋势', {
        userSkillConfig: mockUserSkillConfig,
        activeTable: 'orders',
      });
      const result = await analysisV1Skill.run(ctx);

      expect(result.stopReason).toBe('SUCCESS');
      const query = (result.params as { query: string }).query;
      expect(query).toContain('order_time'); // From fieldMapping
    });

    test('should fallback to guessing when no fieldMapping', async () => {
      const ctx = createMockContext('订单按天趋势图', {
        schemaDigest: 'Table: orders (id, created_at, amount)',
      });
      const result = await analysisV1Skill.run(ctx);

      expect(result.stopReason).toBe('SUCCESS');
      const query = (result.params as { query: string }).query;
      expect(query).toContain('created_at'); // Guessed from schema
    });

    test('should use fieldMapping.amountColumn for distribution', async () => {
      const ctx = createMockContext('订单金额的分布情况', {
        userSkillConfig: mockUserSkillConfig,
        activeTable: 'orders',
      });
      const result = await analysisV1Skill.run(ctx);

      expect(result.stopReason).toBe('SUCCESS');
      const query = (result.params as { query: string }).query;
      expect(query).toContain('amount'); // From fieldMapping
      expect(query).toContain('AVG');
      expect(query).toContain('MEDIAN');
    });
  });

  describe('Default Filters Injection', () => {
    test('should inject WHERE clause from defaultFilters', async () => {
      const ctx = createMockContext('统计订单总数是多少', {
        userSkillConfig: mockUserSkillConfig,
        activeTable: 'orders',
      });
      const result = await analysisV1Skill.run(ctx);

      expect(result.stopReason).toBe('SUCCESS');
      const query = (result.params as { query: string }).query;
      expect(query).toContain('WHERE');
      expect(query).toContain('status');
      expect(query).toContain('completed');
    });

    test('should not inject WHERE clause when no defaultFilters', async () => {
      const ctx = createMockContext('统计订单总数是多少', {
        activeTable: 'orders',
      });
      const result = await analysisV1Skill.run(ctx);

      expect(result.stopReason).toBe('SUCCESS');
      const query = (result.params as { query: string }).query;
      expect(query).not.toContain('WHERE');
    });

    test('should inject WHERE clause in trend queries', async () => {
      const ctx = createMockContext('订单按天趋势图', {
        userSkillConfig: mockUserSkillConfig,
        activeTable: 'orders',
      });
      const result = await analysisV1Skill.run(ctx);

      expect(result.stopReason).toBe('SUCCESS');
      const query = (result.params as { query: string }).query;
      expect(query).toContain('WHERE');
      expect(query).toContain('status');
    });
  });

  describe('Dynamic Table Name', () => {
    test('should use ctx.activeTable when provided', async () => {
      const ctx = createMockContext('统计订单总数是多少', {
        activeTable: 'my_custom_table',
      });
      const result = await analysisV1Skill.run(ctx);

      expect(result.stopReason).toBe('SUCCESS');
      const query = (result.params as { query: string }).query;
      expect(query).toContain('my_custom_table');
    });

    test('should fallback to main_table_1 when activeTable not provided', async () => {
      const ctx = createMockContext('统计订单总数是多少');
      const result = await analysisV1Skill.run(ctx);

      expect(result.stopReason).toBe('SUCCESS');
      const query = (result.params as { query: string }).query;
      expect(query).toContain('main_table_1');
    });
  });

  describe('Backward Compatibility', () => {
    test('should work without any M10.4 enhancements', async () => {
      const ctx = createMockContext('统计订单总数是多少', {
        schemaDigest: 'Table: orders (id, created_at, amount)',
      });
      const result = await analysisV1Skill.run(ctx);

      expect(result.stopReason).toBe('SUCCESS');
      expect(result.tool).toBe('sql_query_tool');
    });

    test('should handle missing time column gracefully', async () => {
      const ctx = createMockContext('订单按天趋势', {
        schemaDigest: 'Table: orders (id, amount)', // No time column
      });
      const result = await analysisV1Skill.run(ctx);

      // Should ask for clarification
      expect(result.stopReason).toBe('NEED_CLARIFICATION');
      expect(result.message).toContain('时间字段');
    });
  });

  describe('Full Integration', () => {
    test('should use all enhancements together', async () => {
      const ctx = createMockContext('最近30天订单按天趋势', {
        userSkillConfig: mockUserSkillConfig,
        activeTable: 'orders',
        industry: 'ecommerce',
      });
      const result = await analysisV1Skill.run(ctx);

      expect(result.stopReason).toBe('SUCCESS');
      const query = (result.params as { query: string }).query;
      
      // Query Type Router: trend_time
      expect(query).toContain('DATE_TRUNC');
      
      // Field Mapping: timeColumn
      expect(query).toContain('order_time');
      
      // Default Filters: status = 'completed'
      expect(query).toContain('WHERE');
      expect(query).toContain('status');
      
      // Dynamic Table Name
      expect(query).toContain('orders');
    });
  });
});
