/**
 * PromptManager Tests - M10.4 Phase 2
 * Tests new System Skill Pack and User Skill Digest injection
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { PromptManager } from '../promptManager';
import type { UserSkillConfig } from '../skills/types';
import type { UserPersona } from '../../../types/persona';

describe('PromptManager - M10.4 Phase 2', () => {
  let promptManager: PromptManager;

  beforeEach(() => {
    promptManager = new PromptManager();
  });

  const mockPersona: UserPersona = {
    id: 'data_analyst',
    displayName: 'Data Analyst',
    description: 'Professional data analyst',
    expertise: ['SQL', 'Statistics'],
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
            value: 'completed', // LiteralValue can be a string directly
          },
        ],
        metrics: {
          total_revenue: {
            label: 'Total Revenue',
            aggregation: 'sum',
            column: 'amount',
          },
        },
      },
    },
  };

  describe('Backward compatibility (no new parameters)', () => {
    test('should work without industry/userSkillConfig/activeTable', async () => {
      const prompt = await promptManager.getToolSelectionPrompt(
        'ecommerce',
        'Show me total orders',
        'Table: orders (id, amount)',
        []
      );

      expect(prompt).toContain('e-commerce'); // System prompt mentions "e-commerce"
      expect(prompt).toContain('Show me total orders');
      expect(prompt).toContain('Table: orders');
      expect(prompt.length).toBeGreaterThan(100);
    });

    test('should work with persona only', async () => {
      const prompt = await promptManager.getToolSelectionPrompt(
        'ecommerce',
        'Analyze revenue',
        'Table: orders (id, amount)',
        [],
        mockPersona
      );

      expect(prompt).toContain('Data Analyst');
      expect(prompt).toContain('SQL');
    });
  });

  describe('System Skill Pack injection', () => {
    test('should inject Skill Pack when industry is provided', async () => {
      const prompt = await promptManager.getToolSelectionPrompt(
        'ecommerce',
        'Show me orders',
        'Table: orders (id)',
        [],
        undefined,
        'ecommerce' // industry
      );

      expect(prompt).toContain('【Industry Knowledge Pack】');
      expect(prompt).toContain('E-commerce Skill Pack'); // Pack content
    });

    test('should handle Skill Pack loading failure gracefully', async () => {
      const prompt = await promptManager.getToolSelectionPrompt(
        'ecommerce',
        'Show me orders',
        'Table: orders (id)',
        [],
        undefined,
        'invalid_industry' // This will fail to load locally, but succeed with mock remote
      );

      // Should still return a valid prompt (non-blocking)
      expect(prompt).toContain('e-commerce');
      expect(prompt.length).toBeGreaterThan(100);
      // With mock remote, it will contain a Skill Pack section
      // This tests that even with invalid industry, system doesn't crash
    });
  });

  describe('User Skill Digest injection', () => {
    test('should inject User Skill Digest when config and activeTable are provided', async () => {
      const prompt = await promptManager.getToolSelectionPrompt(
        'ecommerce',
        'Show me revenue',
        'Table: orders (id, amount)',
        [],
        undefined,
        undefined,
        mockUserSkillConfig,
        'orders' // activeTable
      );

      expect(prompt).toContain('【User Domain Configuration】');
      expect(prompt).toContain('Active table: orders');
      expect(prompt).toContain('Field mapping');
      expect(prompt).toContain('orderId: order_id'); // Actual format from digestBuilder
    });

    test('should NOT inject digest when userSkillConfig is missing', async () => {
      const prompt = await promptManager.getToolSelectionPrompt(
        'ecommerce',
        'Show me revenue',
        'Table: orders (id, amount)',
        [],
        undefined,
        undefined,
        undefined, // no config
        'orders'
      );

      expect(prompt).not.toContain('【User Domain Configuration】');
    });

    test('should NOT inject digest when activeTable is missing', async () => {
      const prompt = await promptManager.getToolSelectionPrompt(
        'ecommerce',
        'Show me revenue',
        'Table: orders (id, amount)',
        [],
        undefined,
        undefined,
        mockUserSkillConfig,
        undefined // no activeTable
      );

      expect(prompt).not.toContain('【User Domain Configuration】');
    });
  });

  describe('Full integration (all features)', () => {
    test('should inject both Skill Pack and User Digest', async () => {
      const prompt = await promptManager.getToolSelectionPrompt(
        'ecommerce',
        'Show me revenue',
        'Table: orders (id, amount)',
        [],
        mockPersona,
        'ecommerce', // industry
        mockUserSkillConfig,
        'orders' // activeTable
      );

      // Check all sections are present in correct order
      expect(prompt).toContain('【Industry Knowledge Pack】');
      expect(prompt).toContain('【User Domain Configuration】');
      expect(prompt).toContain('Data Analyst');

      // Verify order: Skill Pack should come before User Digest
      const skillPackIndex = prompt.indexOf('【Industry Knowledge Pack】');
      const userDigestIndex = prompt.indexOf('【User Domain Configuration】');
      const personaIndex = prompt.indexOf('Data Analyst');

      expect(skillPackIndex).toBeLessThan(userDigestIndex);
      expect(userDigestIndex).toBeLessThan(personaIndex);
    });

    test('should include attachments context', async () => {
      const mockAttachments = [
        {
          id: 'test-1',
          file: { name: 'orders.csv' } as File,
          tableName: 'orders',
          status: 'success' as const,
        },
      ];

      const prompt = await promptManager.getToolSelectionPrompt(
        'ecommerce',
        'Analyze data',
        'Table: orders (id)',
        mockAttachments,
        undefined,
        'ecommerce',
        mockUserSkillConfig,
        'orders'
      );

      expect(prompt).toContain('orders.csv');
      expect(prompt).toContain('table "orders"');
    });
  });

  describe('Prompt structure and length', () => {
    test('should log total prompt length', async () => {
      const prompt = await promptManager.getToolSelectionPrompt(
        'ecommerce',
        'Show me orders',
        'Table: orders (id, amount)',
        [],
        mockPersona,
        'ecommerce',
        mockUserSkillConfig,
        'orders'
      );

      // Prompt should be substantial but not excessive
      expect(prompt.length).toBeGreaterThan(500);
      expect(prompt.length).toBeLessThan(10000);
    });

    test('should use separators between sections', async () => {
      const prompt = await promptManager.getToolSelectionPrompt(
        'ecommerce',
        'Show me orders',
        'Table: orders (id)',
        [],
        undefined,
        'ecommerce',
        mockUserSkillConfig,
        'orders'
      );

      // Check for section separators
      const separatorCount = (prompt.match(/---/g) || []).length;
      expect(separatorCount).toBeGreaterThanOrEqual(3); // At least 3 separators
    });
  });
});
