import { PromptManager } from './promptManager.ts';
import { tools, toolSchemas, MissingColumnError, CannotAnswerError } from '../tools/duckdbTools.ts';
import { LlmClient, LLMConfig } from './llmClient.ts';
import { Attachment } from '../../types/workbench.types';
import OpenAI from 'openai';
import { getPersonaById } from '../../config/personas';

// Define the expected return type for executeQuery
export type QueryResult = { data: any[]; schema: any[] };
export type ExecuteQueryFunc = (sql: string) => Promise<QueryResult>;

export class AgentExecutor {
  private promptManager = new PromptManager();
  private llmClient: LlmClient;
  private executeQuery: ExecuteQueryFunc;
  private llmConfig: LLMConfig;
  private attachments: Attachment[];

  constructor(config: LLMConfig, executeQuery: ExecuteQueryFunc, attachments: Attachment[] = []) {
    this.llmClient = new LlmClient(config);
    this.executeQuery = executeQuery;
    this.llmConfig = config;
    this.attachments = attachments;
  }

  private async _getAllTableSchemas(): Promise<string> {
    // Ensure executeQuery is called with the correct type
    const tablesResult: QueryResult = await this.executeQuery(
      "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'main_table_%';"
    );

    let tableNames: string[] = [];
    // Access data from tablesResult.data
    if (tablesResult && Array.isArray(tablesResult.data)) {
      tableNames = tablesResult.data.map((row: any) => row.table_name);
    }

    console.log('[AgentExecutor] Fetched tables:', tableNames);

    if (tableNames.length === 0) {
      try {
        // Ensure executeQuery is called with the correct type
        const schemaResult: QueryResult = await this.executeQuery(`DESCRIBE main_table;`);
        // Access data from schemaResult.data
        let schemaRows = schemaResult.data;
        const schemaString = schemaRows
          .map((col: any) => `  - ${col.column_name || col.column_name} (${col.column_type || col.column_type})`) // Use column_name and column_type consistently
          .join('\n');
        return `Table: main_table\nColumns:\n${schemaString}`;
      } catch (e) {
        throw new Error('No user tables found in the database.');
      }
    }

    const schemaPromises = tableNames.map(async (tableName: string) => {
      try {
        // Ensure executeQuery is called with the correct type
        const schemaResult: QueryResult = await this.executeQuery(`DESCRIBE "${tableName}";`);
        // Access data from schemaResult.data
        let schemaRows = schemaResult.data;

        const schemaString = schemaRows
          .map((col: any) => `  - ${col.column_name || col.column_name} (${col.column_type || col.column_type})`) // Use column_name and column_type consistently
          .join('\n');

        const attachment = this.attachments.find(att => att.tableName === tableName);
        const sheetNameHint = attachment?.sheetName ? ` (from sheet: "${attachment.sheetName}")` : '';

        return `Table: ${tableName}${sheetNameHint}\nColumns:\n${schemaString}`;
      } catch (error) {
        console.error(`Failed to get schema for table ${tableName}:`, error);
        return `// Failed to retrieve schema for table: ${tableName}`;
      }
    });

    const schemas = await Promise.all(schemaPromises);
    return schemas.join('\n\n');
  }

  private _sanitizeBigInts(data: any): any {
    if (typeof data === 'bigint') {
      return data.toString();
    }
    if (Array.isArray(data)) {
      return data.map(item => this._sanitizeBigInts(item));
    }
    if (typeof data === 'object' && data !== null) {
      const newData: { [key: string]: any } = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          newData[key] = this._sanitizeBigInts(data[key]);
        }
      }
      return newData;
    }
    return data;
  }

  /**
   * Constructs a detailed error message when the LLM fails to return a valid tool call.
   * It tries to extract reasons from the LLM's content, even if it's not perfectly formatted.
   */
  private _getToolCallErrorMessage(message: OpenAI.Chat.Completions.ChatCompletionMessage, userInput: string): string {
    let llmReason = '';
    let rawContentSnippet = '';

    if (message.content && typeof message.content === 'string') {
      rawContentSnippet = message.content.substring(0, 500);
      try {
        const parsedContent = JSON.parse(message.content);
        llmReason = parsedContent.thought || parsedContent.action?.args?.explanation || '';
      } catch (e) {
        console.error('[AgentExecutor] Failed to parse message.content as JSON and no regex match:'
          , e, 'Raw content:', message.content, " user input: ", userInput);
        // JSON parsing failed, try regex as a fallback
        const thoughtRegex = /"thought":\s*"(.*?)(?<!\\)"/s;
        const explanationRegex = /"explanation":\s*"(.*?)(?<!\\)"/s;
        const thoughtMatch = message.content.match(thoughtRegex);
        const explanationMatch = message.content.match(explanationRegex);
        if (thoughtMatch && thoughtMatch[1]) {
          llmReason = thoughtMatch[1].replace(/\\"/g, '"');
        } else if (explanationMatch && explanationMatch[1]) {
          llmReason = explanationMatch[1].replace(/\\"/g, '"');
        }
      }
    }

    if (llmReason) return llmReason;
    if (rawContentSnippet) return rawContentSnippet;
    return 'An unknown error occurred while processing the AI response.';
  }

  public async execute(
    userInput: string,
    signal?: AbortSignal,
    options?: { persona?: string }
  ): Promise<{
    tool: string;
    params: any;
    result: any;
    schema: any[];
    thought: string;
    cancelled?: boolean;
    llmDurationMs?: number;
    queryDurationMs?: number;
  }> {
    try {
      const allTableSchemas = await this._getAllTableSchemas();
      if (!allTableSchemas) {
        throw new Error('Could not retrieve any table schemas.');
      }

      console.log('[AgentExecutor] Fetched all table schemas:\n', allTableSchemas);
      // Get persona information
      const personaId = options?.persona || 'business_user';
      const persona = getPersonaById(personaId);

      const role = 'ecommerce';
      const userPromptTemplate = this.promptManager.getToolSelectionPrompt(
        role,
        userInput,
        allTableSchemas,
        this.attachments,
        persona
      );

      // --------- 1) Measure LLM decision duration ----------
      const llmStart = performance.now();

      let response: any;
      if (this.llmConfig.mockEnabled) {
        console.warn('[AgentExecutor] LLM Mock is ENABLED. Returning mock response.');
        // Mock response should also include a schema for consistency
        response = {
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  thought: `Mocking LLM response for query: "${userInput}". Decided to use sql_query_tool.`,
                  action: {
                    tool: 'sql_query_tool',
                    args: {
                      query: `SELECT 'mocked_value' AS mock_result, '${userInput}' AS user_query, CURRENT_TIMESTAMP AS create_at FROM main_table_1 LIMIT 10;`,
                    },
                  },
                }),
              },
              finish_reason: 'stop',
              index: 0,
            },
          ],
        };
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
          model: this.llmClient.modelName,
          messages: [
            {
              role: 'system',
              content:
                'You are an expert data analyst who writes SQL queries based on user requests.',
            },
            { role: 'user', content: userPromptTemplate },
          ],
          // Map internal toolSchemas to OpenAI-style functions for function-calling
          functions: toolSchemas.map((t) => ({
            name: t.tool,
            description: t.description,
            parameters: t.params,
          })),
          // Let the model decide whether to call a function
          function_call: 'auto',
        };
        response = await this.llmClient.chatCompletions(params, signal);
      }

      const llmEnd = performance.now();
      const llmDurationMs = llmEnd - llmStart;
      // ---------------------------------------

      const message = response.choices[0].message;
      // Normalize function call retrieval to support different provider shapes
      // OpenAI style: message.function_call (object) or message.tool_calls (array)
      let toolCall: any = null;
      let thought = `AI decided to use a tool.`;
      if (message.function_call) {
        toolCall = {
          type: 'function',
          function: {
            name: message.function_call.name,
            arguments: message.function_call.arguments,
          },
        };
      } else if (message.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        toolCall = message.tool_calls[0];
      }

      // This block attempts to parse toolCall from message.content if tool_calls/function_call is missing
      if (!toolCall && message.content && typeof message.content === 'string') {
        try {
          const parsedContent = JSON.parse(message.content);
          if (parsedContent.action && parsedContent.action.tool) {
            toolCall = {
              id: `call_${Date.now()}`,
              type: 'function',
              function: {
                name: parsedContent.action.tool,
                arguments: JSON.stringify(parsedContent.action.args),
              }
            };
            thought = parsedContent.thought || thought;
            console.log('[AgentExecutor] Extracted tool call from message content.');
          }
        } catch (e) {
          console.warn('[AgentExecutor] Message content is not a valid JSON for tool call, will be handled by !toolCall check.');
        }
      }

      if (!toolCall) {
        const errorMessage = this._getToolCallErrorMessage(message, userInput);
        console.error('[AgentExecutor] LLM did not select a tool or returned unparseable content.');
        throw new Error(errorMessage);
      }

      if (toolCall.type === 'function') {
        const toolName = toolCall.function.name;
        let args: any = {};
        try {
          args = typeof toolCall.function.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;
        } catch (e) {
          // If parsing fails, keep original and let tools handle validation
          args = toolCall.function.arguments;
        }
        const toolFunction = tools[toolName];
        if (!toolFunction) {
          throw new Error(`LLM selected an unknown tool: ${toolName}`);
        }

        // --------- 2) Measure query execution duration (only for sql_query_tool) ----------
        let queryDurationMs: number | undefined = undefined;
        let toolResult: QueryResult;

        if (toolName === 'sql_query_tool') {
          const queryStart = performance.now();
          toolResult = await toolFunction(this.executeQuery, args);
          const queryEnd = performance.now();
          queryDurationMs = queryEnd - queryStart;
        } else {
          // Other tools (e.g., cannot_answer_tool) do not measure query duration
          toolResult = await toolFunction(this.executeQuery, args);
        }

        // toolFunction now returns { data, schema }
        const sanitizedData = this._sanitizeBigInts(toolResult.data);

        return {
          tool: toolName,
          params: args,
          result: sanitizedData, // Renamed from 'result' to 'data' for clarity, but keeping 'result' for now to minimize changes
          schema: toolResult.schema, // Pass the schema through
          thought: thought,
          llmDurationMs,
          queryDurationMs,
        };
      } else {
        throw new Error(`Unsupported tool type: ${toolCall.type}`);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[AgentExecutor] Analysis cancelled by user.');
        // Return a structure consistent with the success path, but indicating cancellation
        return { cancelled: true, tool: '', params: {}, result: [], schema: [], thought: '' };
      }

      if (error instanceof MissingColumnError) {
        const userFriendlyMessage = `很抱歉，我无法找到您请求的字段 '${error.missingColumn}'。请检查您的文件是否包含此列，或尝试使用其他字段进行分析。`;
        error.message = userFriendlyMessage;
      } else if (error instanceof CannotAnswerError) {
        // The error message from CannotAnswerError is already user-friendly.
        // No modification is needed, but we explicitly acknowledge it here for clarity.
      }

      console.error('Agent execution failed:', error);
      throw error;
    }
  }
}
