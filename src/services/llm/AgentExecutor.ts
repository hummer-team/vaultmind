import { PromptManager } from './PromptManager';
import { tools, toolSchemas } from '../tools/DuckdbTools';
import { LLMClient, LLMConfig } from './LLMClient';

export type ExecuteQueryFunc = (sql: string) => Promise<any>;

export class AgentExecutor {
  private promptManager = new PromptManager();
  private llmClient: LLMClient;
  private executeQuery: ExecuteQueryFunc;
  private llmConfig: LLMConfig;

  constructor(config: LLMConfig, executeQuery: ExecuteQueryFunc) {
    this.llmClient = new LLMClient(config);
    this.executeQuery = executeQuery;
    this.llmConfig = config;
  }

  private async _getAllTableSchemas(): Promise<string> {
    const tablesResult = await this.executeQuery(
      "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'main_table_%';"
    );
    
    let tableNames: string[] = [];
    // Check if the result is the expected object with a 'rows' array
    if (tablesResult && Array.isArray(tablesResult.rows)) {
      // Extract table name from each sub-array in 'rows'
      tableNames = tablesResult.rows.map((row: any[]) => row[0]);
    }

    console.log('[AgentExecutor] Fetched tables:', tableNames);

    if (tableNames.length === 0) {
      // If no user tables, fallback to old behavior for single-file case.
      // This can be removed if single-file uploads also use the main_table_1 convention.
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
        const schema = await this.executeQuery(`DESCRIBE "${tableName}";`);
        // The schema result is also an object with a 'rows' property
        if (schema && Array.isArray(schema.rows)) {
            const schemaString = schema.rows
              .map((col: any[]) => `  - ${col[0]} (${col[1]})`) // Assuming name is at index 0, type at index 1
              .join('\n');
            return `Table: ${tableName}\nColumns:\n${schemaString}`;
        }
        return `// Could not parse schema for table: ${tableName}`;
      } catch (error) {
        console.error(`Failed to get schema for table ${tableName}:`, error);
        return `// Failed to retrieve schema for table: ${tableName}`;
      }
    });

    const schemas = await Promise.all(schemaPromises);
    return schemas.join('\n\n');
  }

  /**
   * Recursively sanitizes BigInt values in data structures to strings.
   * DuckDB returns BigInts for COUNT/SUM, which need to be converted for JSON serialization/display.
   * @param data The data structure to sanitize.
   * @returns The sanitized data structure.
   */
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

  public async execute(userInput: string): Promise<any> {
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
        allTableSchemas
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
        console.log('[AgentExecutor] Calling official openai.chat.completions.create...');
        response = await this.llmClient.client.chat.completions.create({
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
        });
      }

      const message = response.choices[0].message;
      console.log('[AgentExecutor] Received LLM message:', message);

      let toolCall = message.tool_calls?.[0];
      let thought = `AI decided to use a tool.`;

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
              },
            };
            thought = parsedContent.thought || thought;
            console.log('[AgentExecutor] Extracted tool call from message content.');
          }
        } catch (e) {
          console.warn('[AgentExecutor] Message content is not a valid JSON for tool call.');
        }
      }

      if (!toolCall) {
        throw new Error('未正确解析指令请重新输入.');
      }

      if (toolCall.type === 'function') {
        const toolName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        console.log(`[AgentExecutor] LLM wants to execute tool: ${toolName} with params:`, args);

        const toolFunction = tools[toolName];
        if (!toolFunction) {
          throw new Error(`LLM selected an unknown tool: ${toolName}`);
        }

        const toolResult = await toolFunction(this.executeQuery, args);
        const sanitizedResult = this._sanitizeBigInts(toolResult); // Sanitize BigInts here

        return {
          tool: toolName,
          params: args,
          result: sanitizedResult, // Return sanitized result
          thought: thought,
        };
      } else {
        throw new Error(`Unsupported tool type: ${toolCall.type}`);
      }
    } catch (error) {
      console.error('Agent execution failed:', error);
      throw error;
    }
  }
}
