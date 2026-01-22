/**
 * @file settingsService.ts
 * @description A service for managing user settings, including profile and LLM configurations.
 * It uses the StorageService for data persistence.
 */

import { storageService } from './storageService.ts';
import { v4 as uuidv4 } from 'uuid';

// --- Data Structures ---

export interface UserProfile {
  nickname: string;
  avatar: string;
  occupation: string;
  skills: string[];
}

export interface LLMProviderConfig {
  id: string;
  url: string;
  apiKey: string;
  isEnabled: boolean;
}

// --- Constants for Storage Keys ---

const USER_PROFILE_KEY = 'userProfile';
const LLM_CONFIGS_KEY = 'llmProviderConfigs';
const USER_PERSONA_KEY = 'vaultmind_user_persona2';
const PERSONA_PROMPT_DISMISSED_KEY = 'vaultmind_persona_prompt_dismissed2';


// --- Service Class ---

type LlmConfigChangeListener = () => void;

export class LlmConfigConflictError extends Error {
  public readonly code = 'LLM_CONFIG_CONFLICT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'LlmConfigConflictError';
  }
}

class SettingsService {
  private llmConfigListeners: Set<LlmConfigChangeListener> = new Set();

  /**
   * Subscribe to LLM config changes.
   * @param listener A callback invoked after LLM configs are added/updated/deleted.
   * @returns Unsubscribe function.
   */
  public subscribeLlmConfigChanges(listener: LlmConfigChangeListener): () => void {
    this.llmConfigListeners.add(listener);
    return () => {
      this.llmConfigListeners.delete(listener);
    };
  }

  private emitLlmConfigChanged(): void {
    for (const listener of this.llmConfigListeners) {
      try {
        listener();
      } catch (error) {
        console.error('[SettingsService] LLM config change listener failed:', error);
      }
    }
  }

  // --- User Profile Methods ---

  public async getUserProfile(): Promise<UserProfile> {
    return storageService.getItem<UserProfile>(USER_PROFILE_KEY, {
      nickname: '',
      avatar: '',
      occupation: '',
      skills: [],
    });
  }

  public async saveUserProfile(profile: UserProfile): Promise<void> {
    console.log('[SettingsService] Saving user profile:', profile);
    await storageService.setItem(USER_PROFILE_KEY, profile);
  }

  // --- LLM Provider Config Methods ---

  public async getLlmConfigs(): Promise<LLMProviderConfig[]> {
    return storageService.getItem<LLMProviderConfig[]>(LLM_CONFIGS_KEY, []);
  }

  public async addLlmConfig(config: Omit<LLMProviderConfig, 'id'>): Promise<LLMProviderConfig[]> {
    const configs = await this.getLlmConfigs();

    // Enforce: only one enabled config at a time
    if (config.isEnabled) {
      const alreadyEnabled = configs.find((c) => c.isEnabled);
      if (alreadyEnabled) {
        throw new LlmConfigConflictError(
          'There is already an enabled LLM configuration. Please disable it before enabling another one.'
        );
      }
    }

    const newConfig: LLMProviderConfig = { ...config, id: uuidv4() };
    const updatedConfigs = [...configs, newConfig];
    await storageService.setItem(LLM_CONFIGS_KEY, updatedConfigs);
    console.log('[SettingsService] Added new LLM config:', newConfig);
    this.emitLlmConfigChanged();
    return updatedConfigs;
  }

  public async updateLlmConfig(
    configId: string,
    updates: Partial<Omit<LLMProviderConfig, 'id'>>
  ): Promise<LLMProviderConfig[]> {
    const configs = await this.getLlmConfigs();

    // Enforce: only one enabled config at a time
    if (updates.isEnabled === true) {
      const alreadyEnabled = configs.find((c) => c.isEnabled && c.id !== configId);
      if (alreadyEnabled) {
        throw new LlmConfigConflictError(
          'There is already an enabled LLM configuration. Please disable it before enabling another one.'
        );
      }
    }

    const updatedConfigs = configs.map(c => (c.id === configId ? { ...c, ...updates } : c));
    await storageService.setItem(LLM_CONFIGS_KEY, updatedConfigs);
    console.log(`[SettingsService] Updated LLM config with ID: ${configId}`, updates);
    this.emitLlmConfigChanged();
    return updatedConfigs;
  }

  public async deleteLlmConfig(configId: string): Promise<LLMProviderConfig[]> {
    const configs = await this.getLlmConfigs();
    const updatedConfigs = configs.filter(c => c.id !== configId);
    await storageService.setItem(LLM_CONFIGS_KEY, updatedConfigs);
    console.log(`[SettingsService] Deleted LLM config with ID: ${configId}`);
    this.emitLlmConfigChanged();
    return updatedConfigs;
  }

  /**
   * Get user persona from storage
   * @returns personaId or null if not set
   */
  public getUserPersona(): string | null {
    try {
      return localStorage.getItem(USER_PERSONA_KEY);
    } catch (error) {
      console.error('[SettingsService] Failed to get user persona:', error);
      return null;
    }
  }

  /**
   * Save user persona to storage
   * @param personaId - The persona identifier
   */
  public saveUserPersona(personaId: string): void {
    try {
      localStorage.setItem(USER_PERSONA_KEY, personaId);
      console.log('[SettingsService] User persona saved:', personaId);
    } catch (error) {
      console.error('[SettingsService] Failed to save user persona:', error);
    }
  }

  /**
   * Check if user has set persona
   * @returns true if persona is set, false otherwise
   */
  public hasSetPersona(): boolean {
    return this.getUserPersona() !== null;
  }

  /**
   * Check if persona prompt has been dismissed in current session
   * @returns true if dismissed, false otherwise
   */
  public isPersonaPromptDismissed(): boolean {
    try {
      return sessionStorage.getItem(PERSONA_PROMPT_DISMISSED_KEY) === 'true';
    } catch (error) {
      return false;
    }
  }

  /**
   * Mark persona prompt as dismissed for current session
   */
  public dismissPersonaPrompt(): void {
    try {
      sessionStorage.setItem(PERSONA_PROMPT_DISMISSED_KEY, 'true');
    } catch (error) {
      console.error('[SettingsService] Failed to dismiss persona prompt:', error);
    }
  }
}

// Export a singleton instance
export const settingsService = new SettingsService();
