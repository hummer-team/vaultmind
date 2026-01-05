import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModel } from 'ai';

export interface LLMConfig {
  apiKey: string;
  baseURL: string;
  modelName: string;
}

/**
 * A client responsible for configuring and providing a language model instance.
 * It abstracts away the specifics of the LLM provider.
 */
export class LLMClient {
  public readonly model: LanguageModel;

  constructor(config: LLMConfig) {
    // The `createOpenAI` function is compatible with many OpenAI-like APIs, including Qwen.
    const provider = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.model = provider(config.modelName);
  }
}
