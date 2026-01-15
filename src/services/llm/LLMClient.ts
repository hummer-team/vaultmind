// --- CRITICAL CHANGE: Use the official 'openai' package ---
import OpenAI from 'openai';

// This file no longer depends on 'ai' or '@ai-sdk/openai'
// We define our own types, which makes this client self-contained.
export type LLMProvider = 'dashscope' | 'openai' | 'doubao' | 'gemini' | 'groq';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseURL: string;
  modelName: string;
  mockEnabled?: boolean; // <-- CRITICAL CHANGE: Add mockEnabled flag
}

export class LLMClient {
  // The property is now an instance of the official OpenAI client
  public readonly client: OpenAI;
  public readonly modelName: string;

  constructor(config: LLMConfig) {
    console.log(`[LLMClient] Creating official OpenAI client for provider: ${config.provider}`);

    // Directly instantiate the official OpenAI client, as per the official example.
    // This will correctly construct the URL and request body.
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      dangerouslyAllowBrowser: true,
      // Add a default timeout to the client, can be overridden per request
      timeout: 60 * 1000, // 60 seconds
    });

    this.modelName = config.modelName;

    console.log(`[LLMClient] Official OpenAI client for model "${config.modelName}" created successfully.`);
  }

  // Method to call chat completions with AbortSignal support
  public async chatCompletions(
    params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    signal?: AbortSignal,
  ): Promise<OpenAI.Chat.ChatCompletion> {
    return this.client.chat.completions.create(params, { signal });
  }
}
