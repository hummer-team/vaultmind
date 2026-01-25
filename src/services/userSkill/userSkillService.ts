/**
 * @file userSkillService.ts
 * @description Service for managing User Skill L0 configurations.
 * Provides CRUD operations with zod validation and Chrome storage persistence.
 */

import { storageService } from '../storageService';
import {
  userSkillConfigSchema,
  type UserSkillConfig,
  type TableSkillConfig,
} from './userSkillSchema';
import type { ZodError } from 'zod';

const USER_SKILL_CONFIG_KEY = 'vaultmind_user_skill_config_v1';

/**
 * Error thrown when user skill configuration validation fails.
 */
export class UserSkillValidationError extends Error {
  public readonly code = 'USER_SKILL_VALIDATION_ERROR' as const;
  public readonly zodError: ZodError;

  constructor(message: string, zodError: ZodError) {
    super(message);
    this.name = 'UserSkillValidationError';
    this.zodError = zodError;
  }
}

/**
 * Service for managing user skill configurations.
 */
class UserSkillService {
  /**
   * Load user skill configuration from storage.
   * @returns UserSkillConfig or null if not configured
   */
  public async loadUserSkill(): Promise<UserSkillConfig | null> {
    try {
      const raw = await storageService.getItem<unknown>(USER_SKILL_CONFIG_KEY, null);
      
      if (!raw) {
        console.log('[UserSkillService] No user skill configuration found');
        return null;
      }

      // Validate with zod schema
      const validated = userSkillConfigSchema.parse(raw);
      console.log('[UserSkillService] User skill configuration loaded and validated');
      return validated;
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        console.error('[UserSkillService] User skill configuration validation failed:', error);
        // Return null instead of throwing to allow graceful degradation
        return null;
      }
      console.error('[UserSkillService] Failed to load user skill configuration:', error);
      return null;
    }
  }

  /**
   * Save user skill configuration to storage.
   * @param config User skill configuration
   * @throws UserSkillValidationError if validation fails
   */
  public async saveUserSkill(config: UserSkillConfig): Promise<void> {
    try {
      // Validate before saving
      const validated = userSkillConfigSchema.parse(config);
      await storageService.setItem(USER_SKILL_CONFIG_KEY, validated);
      console.log('[UserSkillService] User skill configuration saved');
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        throw new UserSkillValidationError(
          'User skill configuration validation failed',
          error as ZodError
        );
      }
      throw error;
    }
  }

  /**
   * Get table skill configuration for a specific table.
   * @param tableName Table name (e.g., "main_table_1")
   * @returns TableSkillConfig or null if not configured
   */
  public async getTableSkill(tableName: string): Promise<TableSkillConfig | null> {
    const config = await this.loadUserSkill();
    if (!config) {
      return null;
    }
    return config.tables[tableName] || null;
  }

  /**
   * Update table skill configuration.
   * @param tableName Table name
   * @param tableConfig Table skill configuration
   */
  public async updateTableSkill(
    tableName: string,
    tableConfig: TableSkillConfig
  ): Promise<void> {
    let config = await this.loadUserSkill();
    
    // Initialize config if not exists
    if (!config) {
      config = {
        version: 'v1',
        tables: {},
      };
    }

    // Update or add table config
    config.tables[tableName] = tableConfig;

    // Save back
    await this.saveUserSkill(config);
    console.log(`[UserSkillService] Table skill updated for: ${tableName}`);
  }

  /**
   * Delete table skill configuration.
   * @param tableName Table name
   */
  public async deleteTableSkill(tableName: string): Promise<void> {
    const config = await this.loadUserSkill();
    if (!config) {
      return;
    }

    delete config.tables[tableName];
    await this.saveUserSkill(config);
    console.log(`[UserSkillService] Table skill deleted for: ${tableName}`);
  }

  /**
   * Reset user skill configuration to empty state.
   * @param tableName Optional: reset specific table only
   */
  public async resetToDefault(tableName?: string): Promise<void> {
    if (tableName) {
      // Reset specific table
      const config = await this.loadUserSkill();
      if (config && config.tables[tableName]) {
        delete config.tables[tableName];
        await this.saveUserSkill(config);
        console.log(`[UserSkillService] Table skill reset for: ${tableName}`);
      }
    } else {
      // Reset all
      const emptyConfig: UserSkillConfig = {
        version: 'v1',
        tables: {},
      };
      await this.saveUserSkill(emptyConfig);
      console.log('[UserSkillService] All user skill configuration reset to default');
    }
  }
}

// Export singleton instance
export const userSkillService = new UserSkillService();
