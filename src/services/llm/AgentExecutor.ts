import { PromptManager } from './PromptManager';
import { DuckDBService } from '../DuckDBService';
import { tools, toolSchemas } from '../tools/duckdbTools';
import { LLMClient, LLMConfig } from './LLMClient';
import { streamText } from 'ai';
import { z } from 'zod';

export class AgentExecutor {
  private promptManager = new PromptManager();
  private duckDBService = DuckDBService.getInstance();
  private llmClient: LLMClient;

  constructor(config: LLMConfig) {
    this.llmClient = new LLMClient(config);
  }

  /**
   * Executes the full analysis loop using the correct client-side API for Vercel AI SDK v3
   * and the correct property name for tool arguments (`input`).
   * @param userInput The user's natural language query.
   * @returns A promise that resolves to the result from the executed tool.
   */
  public async execute(userInput: string): Promise<any> {
    try {
      // 1. Get table schema
      const tableSchema = await this.duckDBService.getTableSchema('main_table');
      if (!tableSchema || tableSchema.length === 0) {
        throw new Error("Could not retrieve table schema or table is empty.");
      }

      // 2. Get available tools schema description
      const availableTools = JSON.stringify(toolSchemas, null, 2);

      // 3. Construct the prompt
      const prompt = this.promptManager.getToolSelectionPrompt(userInput, tableSchema, availableTools);

      // 4. Start the stream with `streamText`
      const result = await streamText({
        model: this.llmClient.model,
        prompt: prompt,
        tools: toolSchemas.reduce((acc, toolDef) => {
          acc[toolDef.tool] = {
            description: toolDef.description,
            parameters: z.object(toolDef.params.properties),
          };
          return acc;
        }, {} as any),
      });

      // 5. Iterate through the stream to find the tool call
      for await (const part of result.fullStream) {
        if (part.type === 'tool-call') {
          // 6. CORRECTED: Destructure using the correct property name `input` and rename it to `args`.
          const { toolName, input: args } = part;

          const toolFunction = tools[toolName];
          if (!toolFunction) {
            throw new Error(`LLM selected an unknown tool: ${toolName}`);
          }

          console.log(`Executing tool: ${toolName} with params:`, args);
          const toolResult = await toolFunction(args);

          return {
            tool: toolName,
            params: args,
            result: toolResult,
          };
        }
      }

      // If the loop completes and no tool was called
      throw new Error("The AI did not select a tool to execute.");

    } catch (error) {
      console.error("Agent execution failed:", error);
      throw error; // Re-throw the error to be caught by the UI
    }
  }
}
