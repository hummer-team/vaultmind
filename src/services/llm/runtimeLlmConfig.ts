import type { LLMConfig, LLMProvider } from './llmClient';
import { settingsService } from '../settingsService';

interface ResolveLlmConfigResult {
  /**
   * The resolved config. Null indicates "not configured".
   */
  config: LLMConfig | null;
  /**
   * Whether there is a user-provided config (from Settings) and it is valid.
   */
  isReady: boolean;
}

const DEFAULT_PROVIDER = (import.meta.env.VITE_LLM_PROVIDER as LLMProvider) ?? 'openai';

/**
 * Validate if a config contains minimum required fields.
 */
export function isValidLlmConfig(config: Pick<LLMConfig, 'apiKey' | 'baseURL' | 'modelName'> | null): boolean {
  if (!config) return false;
  return Boolean(config.apiKey?.trim() && config.baseURL?.trim() && config.modelName?.trim());
}

/**
 * Resolve active LLM config at runtime.
 * Priority:
 * 1) First enabled config from Settings (chrome.storage)
 * 2) Fallback to .env (vite import.meta.env) for dev/default
 */
export async function resolveActiveLlmConfig(): Promise<ResolveLlmConfigResult> {
  const configs = await settingsService.getLlmConfigs();
  const enabled = configs.find((c) => c.isEnabled);

  if (enabled) {
    const resolved: LLMConfig = {
      provider: DEFAULT_PROVIDER,
      apiKey: enabled.apiKey,
      baseURL: enabled.url,
      modelName: (import.meta.env.VITE_LLM_MODEL_NAME as string) ?? '',
      mockEnabled: import.meta.env.VITE_LLM_MOCK === 'true',
    };

    return { config: resolved, isReady: isValidLlmConfig(resolved) };
  }

  const fallback: LLMConfig = {
    provider: DEFAULT_PROVIDER,
    apiKey: (import.meta.env.VITE_LLM_API_KEY as string) ?? '',
    baseURL: (import.meta.env.VITE_LLM_API_URL as string) ?? '',
    modelName: (import.meta.env.VITE_LLM_MODEL_NAME as string) ?? '',
    mockEnabled: import.meta.env.VITE_LLM_MOCK === 'true',
  };

  return { config: fallback, isReady: isValidLlmConfig(fallback) };
}

