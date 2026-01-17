import { PromptManager } from './PromptManager';
import { tools, toolSchemas, MissingColumnError, CannotAnswerError } from '../tools/DuckdbTools';
import { LLMClient, LLMConfig } from './LLMClient';
import { Attachment } from '../../types/workbench.types';
import OpenAI from 'openai';

export type ExecuteQueryFunc = (sql: string) => Promise<any[]>;

export class AgentExecutor {
  private promptManager = new PromptManager();
  private llmClient: LLMClient;
  private executeQuery: ExecuteQueryFunc;
  private llmConfig: LLMConfig;
  private attachments: Attachment[];

  constructor(config: LLMConfig, executeQuery: ExecuteQueryFunc, attachments: Attachment[] = []) {
    this.llmClient = new LLMClient(config);
    this.executeQuery = executeQuery;
    this.llmConfig = config;
    this.attachments = attachments;
  }

  private async _getAllTableSchemas(): Promise<string> {
    const tablesResult = await this.executeQuery(
      "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'main_table_%';"
    );
    
    const tableNames = (tablesResult || []).map((row: any) => row.table_name);

    console.log('[AgentExecutor] Fetched tables:', tableNames);

    if (tableNames.length === 0) {
      // Fallback for single table scenario if info schema fails
      try {
        const schema = await this.executeQuery(`DESCRIBE main_table;`);
        const schemaString = schema
          .map((col: any) => `  - ${col.column_name} (${col.column_type})`)
          .join('\n');
        return `Table: main_table\nColumns:\n${schemaString}`;
      } catch (e) {
        throw new Error('No user tables found in the database.');
      }
    }

    const schemaPromises = tableNames.map(async (tableName: string) => {
      try {
        const schemaResult = await this.executeQuery(`DESCRIBE "${tableName}";`);
        const schemaString = schemaResult
          .map((col: any) => `  - ${col.column_name} (${col.column_type})`)
          .join('\n');
        
        // Find the corresponding attachment to get the sheet name
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
      rawContentSnippet = message.content.substring(0, 500); // Take a snippet for logging
      try {
        const parsedContent = JSON.parse(message.content);
        // Try to get reason from thought or explanation
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
          llmReason = thoughtMatch[1].replace(/\\"/g, '"'); // Unescape quotes
        } else if (explanationMatch && explanationMatch[1]) {
          llmReason = explanationMatch[1].replace(/\\"/g, '"'); // Unescape quotes
        }
      }
    }

    if (llmReason) {
      return llmReason;
    }
    if (rawContentSnippet && llmReason.includes('非JSON格式或无法解析')) { // Only show raw snippet if JSON parsing failed
        return rawContentSnippet;
    }

    return '请调整指令重试';
  }

  public async execute(userInput: string, signal?: AbortSignal): Promise<any> {
    try {
      const allTableSchemas = await this._getAllTableSchemas();
      if (!allTableSchemas) {
        throw new Error('Could not retrieve any table schemas.');
      }

      console.log('[AgentExecutor] Fetched all table schemas:\n', allTableSchemas);

      const role = 'ecommerce';
      const userPromptTemplate = this.promptManager.getToolSelectionPrompt(
        role,
        userInput,
        allTableSchemas,
        this.attachments
      );

      let response: any;
      if (this.llmConfig.mockEnabled) {
        console.warn('[AgentExecutor] LLM Mock is ENABLED. Returning mock response.');
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
                      query: `SELECT 'mocked_value' AS mock_result, '${userInput}' AS user_query FROM main_table_1 LIMIT 10;`,
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
          tools: toolSchemas.map((t) => ({
            type: 'function',
            function: {
              name: t.tool,
              description: t.description,
              parameters: t.params,
            },
          })),
          tool_choice: 'auto',
        };
        response = await this.llmClient.chatCompletions(params, signal);
      }

      const message = response.choices[0].message;
      let toolCall = message.tool_calls?.[0];
      let thought = `AI decided to use a tool.`;

      // This block attempts to parse toolCall from message.content if tool_calls is missing
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
        const args = JSON.parse(toolCall.function.arguments);
        const toolFunction = tools[toolName];
        if (!toolFunction) {
          throw new Error(`LLM selected an unknown tool: ${toolName}`);
        }

        const toolResult = await toolFunction(this.executeQuery, args);
        const sanitizedResult = this._sanitizeBigInts(toolResult);

        return {
          tool: toolName,
          params: args,
          result: sanitizedResult,
          thought: thought,
        };
      } else {
        throw new Error(`Unsupported tool type: ${toolCall.type}`);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[AgentExecutor] Analysis cancelled by user.');
        return { cancelled: true };
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
