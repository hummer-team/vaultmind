import { PromptManager } from './promptManager.ts';
import { tools, toolSchemas, MissingColumnError } from '../tools/duckdbTools.ts';
import { LlmClient, LLMConfig } from './llmClient.ts';
import { Attachment } from '../../types/workbench.types';
import OpenAI from 'openai';
import { getPersonaById } from '../../config/personas';
import { emitAgentEvent } from './agentEvents.ts';
import { rewriteQuery } from './rewrite.ts';
import { discoverSchema, formatSchemaDigest } from './schemaDiscovery.ts';
import { debugSqlOnce } from './sqlDebug.ts';

// Define the expected return type for executeQuery
export type QueryResult = { data: unknown[]; schema: unknown[] };
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
      tableNames = tablesResult.data
        .map((row: unknown) => {
          if (typeof row === 'object' && row !== null && 'table_name' in row) {
            const value = (row as { table_name?: unknown }).table_name;
            return typeof value === 'string' ? value : '';
          }
          return '';
        })
        .filter((name) => name.length > 0);
    }

    console.log('[AgentExecutor] Fetched tables:', tableNames);

    if (tableNames.length === 0) {
      try {
        const schemaResult: QueryResult = await this.executeQuery(`DESCRIBE main_table;`);
        const schemaRows = schemaResult.data;
        const schemaString = schemaRows
          .map((col: unknown) => {
            if (typeof col === 'object' && col !== null) {
              const c = col as { column_name?: unknown; column_type?: unknown };
              const name = typeof c.column_name === 'string' ? c.column_name : 'unknown_column';
              const type = typeof c.column_type === 'string' ? c.column_type : 'unknown_type';
              return `  - ${name} (${type})`;
            }
            return `  - unknown_column (unknown_type)`;
          })
          .join('\n');
        return `Table: main_table\nColumns:\n${schemaString}`;
      } catch (_e) {
        throw new Error('No user tables found in the database.');
      }
    }

    const schemaPromises = tableNames.map(async (tableName: string) => {
      try {
        const schemaResult: QueryResult = await this.executeQuery(`DESCRIBE "${tableName}";`);
        const schemaRows = schemaResult.data;

        const schemaString = schemaRows
          .map((col: unknown) => {
            if (typeof col === 'object' && col !== null) {
              const c = col as { column_name?: unknown; column_type?: unknown };
              const name = typeof c.column_name === 'string' ? c.column_name : 'unknown_column';
              const type = typeof c.column_type === 'string' ? c.column_type : 'unknown_type';
              return `  - ${name} (${type})`;
            }
            return `  - unknown_column (unknown_type)`;
          })
          .join('\n');

        const attachment = this.attachments.find((att) => att.tableName === tableName);
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

  private _sanitizeBigInts(data: unknown): unknown {
    if (typeof data === 'bigint') {
      return data.toString();
    }
    if (Array.isArray(data)) {
      return data.map((item) => this._sanitizeBigInts(item));
    }
    if (typeof data === 'object' && data !== null) {
      const newData: Record<string, unknown> = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          newData[key] = this._sanitizeBigInts((data as Record<string, unknown>)[key]);
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

    if (typeof message.content === 'string') {
      rawContentSnippet = message.content.substring(0, 500);
      try {
        const parsedContent = JSON.parse(message.content) as {
          thought?: unknown;
          action?: { args?: { explanation?: unknown } };
        };
        llmReason =
          (typeof parsedContent.thought === 'string' ? parsedContent.thought : '') ||
          (typeof parsedContent.action?.args?.explanation === 'string' ? parsedContent.action.args.explanation : '');
      } catch (e) {
        console.error(
          '[AgentExecutor] Failed to parse message.content as JSON and no regex match:',
          e,
          'Raw content:',
          message.content,
          ' user input: ',
          userInput
        );
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
    options?: { persona?: string; sessionId?: string }
  ): Promise<{
    tool: string;
    params: unknown;
    result: unknown;
    schema: unknown[];
    thought: string;
    cancelled?: boolean;
    llmDurationMs?: number;
    queryDurationMs?: number;
  }> {
    const runId = `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const sessionId = options?.sessionId;

    emitAgentEvent({
      type: 'agent.run.start',
      runId,
      sessionId,
      ts: Date.now(),
      userInput,
      personaId: options?.persona,
    });

    try {
      const allTableSchemas = await this._getAllTableSchemas();
      if (!allTableSchemas) {
        throw new Error('Could not retrieve any table schemas.');
      }

      // Best-effort: extract table names from schema string for observability.
      const tableNames = allTableSchemas
        .split('\n')
        .filter((line) => line.startsWith('Table: '))
        .map((line) => line.replace('Table: ', '').split(' ')[0])
        .filter((name) => name.length > 0);

      emitAgentEvent({
        type: 'agent.schema.ready',
        runId,
        sessionId,
        ts: Date.now(),
        tableNames,
      });

      // --- M3 Rewrite layer ---
      // Keep schema digest compact. We start with the schema string (already compact-ish).
      // If rewrite indicates schema discovery is needed, we will run DESCRIBE for tables.
      const initialDigest = allTableSchemas.slice(0, 4000);
      const rewrite = await rewriteQuery(this.llmConfig, userInput, initialDigest);

      // If we need clarification, avoid generating SQL.
      if (rewrite.needClarification) {
        const explanation = rewrite.clarifyingQuestions.length
          ? `Need clarification:\n- ${rewrite.clarifyingQuestions.join('\n- ')}`
          : 'Need clarification to proceed.';

        // Stop early: do not attempt NL2SQL or any tool execution.
        throw new Error(explanation);
      }

      let effectiveSchemaString = allTableSchemas;

      // Schema discovery can be run when riskFlags indicates so.
      if (rewrite.riskFlags.includes('needs_schema_discovery') && tableNames.length > 0) {
        try {
          const discovery = await discoverSchema(this.executeQuery, tableNames);
          const digest = formatSchemaDigest(discovery);
          // Append digest rather than replacing, to minimize prompt changes.
          effectiveSchemaString = `${allTableSchemas}\n\n// SchemaDigest (discovered)\n${digest}`;
        } catch (e) {
          console.warn('[AgentExecutor] Schema discovery failed, fallback to existing schemas:', e);
        }
      }

      console.log('[AgentExecutor] Fetched all table schemas:\n', effectiveSchemaString);
      // Get persona information
      const personaId = options?.persona || 'business_user';
      const persona = getPersonaById(personaId);

      const role = 'ecommerce';
      const userPromptTemplate = this.promptManager.getToolSelectionPrompt(
        role,
        userInput,
        effectiveSchemaString,
        this.attachments,
        persona
      );

      // --------- 1) Measure LLM decision duration ----------
      const llmStart = performance.now();

      let response: unknown;
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
              content: 'You are an expert data analyst who writes SQL queries based on user requests.',
            },
            { role: 'user', content: userPromptTemplate },
          ],
          functions: toolSchemas.map((t) => ({
            name: t.tool,
            description: t.description,
            parameters: t.params,
          })),
          function_call: 'auto',
        };
        response = await this.llmClient.chatCompletions(params, signal);
      }

      const llmEnd = performance.now();
      const llmDurationMs = llmEnd - llmStart;

      const responseObj = response as {
        choices: Array<{ message: OpenAI.Chat.Completions.ChatCompletionMessage }>;
      };

      const message = responseObj.choices[0]?.message;
      if (!message) {
        throw new Error('LLM returned an empty response.');
      }

      const rawModelOutputSnippet = typeof message.content === 'string' ? message.content.slice(0, 500) : '';

      // Normalize function call retrieval to support different provider shapes
      let toolCall: { type: 'function'; function: { name: string; arguments: string } } | null = null;
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
        const first = message.tool_calls[0];
        if (first?.type === 'function' && first.function?.name) {
          toolCall = {
            type: 'function',
            function: {
              name: first.function.name,
              arguments: first.function.arguments ?? '{}',
            },
          };
        }
      }

      // This block attempts to parse toolCall from message.content if tool_calls/function_call is missing
      if (!toolCall && typeof message.content === 'string') {
        try {
          const parsedContent = JSON.parse(message.content) as {
            thought?: string;
            action?: { tool?: string; args?: unknown };
          };
          if (parsedContent.action?.tool) {
            toolCall = {
              type: 'function',
              function: {
                name: parsedContent.action.tool,
                arguments: JSON.stringify(parsedContent.action.args ?? {}),
              },
            };
            thought = parsedContent.thought || thought;
            console.log('[AgentExecutor] Extracted tool call from message content.');
          }
        } catch (_e) {
          console.warn(
            '[AgentExecutor] Message content is not a valid JSON for tool call, will be handled by !toolCall check.'
          );
        }
      }

      if (!toolCall) {
        const reason = this._getToolCallErrorMessage(message, userInput);
        emitAgentEvent({
          type: 'agent.error',
          runId,
          sessionId,
          ts: Date.now(),
          errorCategory: 'LLM_ERROR',
          errorMessage: reason,
          rawModelOutputSnippet,
        });
        emitAgentEvent({
          type: 'agent.run.end',
          runId,
          sessionId,
          ts: Date.now(),
          ok: false,
          stopReason: 'UNKNOWN',
          errorCategory: 'LLM_ERROR',
          errorMessage: reason,
          llmDurationMs,
        });
        throw new Error(reason);
      }

      const toolName = toolCall.function.name;
      const toolFn = tools[toolName];
      if (!toolFn) {
        const msg = `Tool '${toolName}' is not registered.`;
        emitAgentEvent({
          type: 'agent.error',
          runId,
          sessionId,
          ts: Date.now(),
          errorCategory: 'UNKNOWN',
          errorMessage: msg,
          rawModelOutputSnippet,
        });
        emitAgentEvent({
          type: 'agent.run.end',
          runId,
          sessionId,
          ts: Date.now(),
          ok: false,
          stopReason: 'UNKNOWN',
          errorCategory: 'UNKNOWN',
          errorMessage: msg,
          llmDurationMs,
        });
        throw new Error(msg);
      }

      let toolArgs: unknown = {};
      try {
        toolArgs = JSON.parse(toolCall.function.arguments || '{}') as unknown;
      } catch (_e) {
        toolArgs = {};
      }

      emitAgentEvent({
        type: 'agent.tool.call',
        runId,
        sessionId,
        ts: Date.now(),
        toolName,
        argsPreview: typeof toolArgs === 'object' ? JSON.stringify(toolArgs).slice(0, 200) : String(toolArgs).slice(0, 200),
      });

      const queryStart = performance.now();
      let toolResult: unknown;
      try {
        toolResult = await toolFn(this.executeQuery, toolArgs);
      } catch (err: unknown) {
        // --- M4: SQL debug loop (single auto repair) ---
        const isSqlQueryTool = toolName === 'sql_query_tool';
        const originalArgs = toolArgs as { query?: unknown };
        const failedSql = isSqlQueryTool && typeof originalArgs?.query === 'string' ? originalArgs.query : '';

        const isRepairableBinderTimeError =
          err instanceof Error &&
          /Binder Error:/i.test(err.message) &&
          /\-\(TIMESTAMP WITH TIME ZONE, INTERVAL\)/i.test(err.message);

        const isRepairable =
          isSqlQueryTool &&
          !!failedSql &&
          (err instanceof MissingColumnError ||
            (err instanceof Error && /syntax\s+error/i.test(err.message)) ||
            isRepairableBinderTimeError);

        if (isRepairable && !this.llmConfig.mockEnabled) {
          try {
            const schemaDigest = effectiveSchemaString.slice(0, 4000);
            const errorMessage = err instanceof Error ? err.message : 'Unknown SQL tool error.';

            const debugResult = await debugSqlOnce(this.llmConfig, {
              failedSql,
              errorMessage,
              schemaDigest,
            });

            const patchedArgs = { query: debugResult.patchedSql };

            emitAgentEvent({
              type: 'agent.tool.call',
              runId,
              sessionId,
              ts: Date.now(),
              toolName,
              argsPreview: JSON.stringify(patchedArgs).slice(0, 200),
            });

            // Retry once with patched SQL
            toolResult = await toolFn(this.executeQuery, patchedArgs);

            // Merge debug explanation into thought (UI-friendly)
            thought = `${thought}\n\n[Auto SQL Debug]\n${debugResult.explanation}`;
          } catch (repairErr) {
            console.warn('[AgentExecutor] Auto SQL debug failed, fallback to original error:', repairErr);
            // fallthrough to normal error handling below
            throw err;
          }
        } else {
          throw err;
        }
      }

      const queryEnd = performance.now();
      const queryDurationMs = queryEnd - queryStart;

      const sanitized = this._sanitizeBigInts(toolResult);

      const normalizedResult = sanitized as { data?: unknown[]; schema?: unknown[] };
      const rowCount = Array.isArray(normalizedResult.data) ? normalizedResult.data.length : undefined;
      const columns = Array.isArray(normalizedResult.schema)
        ? normalizedResult.schema
            .map((col) => {
              if (typeof col === 'object' && col !== null && 'name' in col) {
                const value = (col as { name?: unknown }).name;
                return typeof value === 'string' ? value : '';
              }
              return '';
            })
            .filter((c) => c.length > 0)
        : undefined;

      emitAgentEvent({
        type: 'agent.tool.result',
        runId,
        sessionId,
        ts: Date.now(),
        toolName,
        rowCount,
        columns,
        queryDurationMs,
      });

      emitAgentEvent({
        type: 'agent.run.end',
        runId,
        sessionId,
        ts: Date.now(),
        ok: true,
        stopReason: 'SUCCESS',
        llmDurationMs,
        queryDurationMs,
      });

      return {
        tool: toolName,
        params: toolArgs,
        result: sanitized,
        schema: Array.isArray(normalizedResult.schema) ? normalizedResult.schema : [],
        thought,
        llmDurationMs,
        queryDurationMs,
      };
    } catch (err: unknown) {
      if (signal?.aborted) {
        emitAgentEvent({
          type: 'agent.run.end',
          runId,
          sessionId,
          ts: Date.now(),
          ok: false,
          stopReason: 'CANCELLED',
          errorCategory: 'CANCELLED',
          errorMessage: 'Request was cancelled.',
        });
        return {
          tool: '',
          params: {},
          result: null,
          schema: [],
          thought: 'Cancelled',
          cancelled: true,
        };
      }

      // If already emitted events in inner blocks, do not duplicate too much.
      const message = err instanceof Error ? err.message : 'Unknown error.';
      console.error('[AgentExecutor] execute failed:', err);
      emitAgentEvent({
        type: 'agent.error',
        runId,
        sessionId,
        ts: Date.now(),
        errorCategory: 'UNKNOWN',
        errorMessage: message,
      });
      emitAgentEvent({
        type: 'agent.run.end',
        runId,
        sessionId,
        ts: Date.now(),
        ok: false,
        stopReason: 'UNKNOWN',
        errorCategory: 'UNKNOWN',
        errorMessage: message,
      });
      throw err;
    }
  }
}
