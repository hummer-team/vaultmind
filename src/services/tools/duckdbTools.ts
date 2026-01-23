import { ExecuteQueryFunc } from '../llm/agentExecutor.ts';
import { validateAndNormalizeSql, SqlPolicyError } from './sqlPolicy.ts';

// --- Custom Error Types ---
export class MissingColumnError extends Error {
  public missingColumn: string;

  constructor(message: string, missingColumn: string) {
    super(message);
    this.name = 'MissingColumnError';
    this.missingColumn = missingColumn;
  }
}

export class CannotAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CannotAnswerError';
  }
}

// --- Tool Definitions ---

/**
 * Executes a given SQL query against the DuckDB database.
 */
export const sql_query_tool = async (
  executeQuery: ExecuteQueryFunc,
  { query }: { query: string }
): Promise<unknown> => {
  // Policy enforcement (M2): allow only read-only SELECT and force LIMIT.
  // Current allowlist strategy: allow tables matching main_table_.* by default.
  // In later milestones, this should be passed from session context.
  const allowedTables = ['main_table', ...Array.from({ length: 50 }, (_, i) => `main_table_${i + 1}`)];

  let normalizedSql = query;
  try {
    const policy = validateAndNormalizeSql(query, {
      allowedTables,
      maxRows: 500,
    });
    normalizedSql = policy.normalizedSql;
    if (policy.warnings.length > 0) {
      console.log('[sql_query_tool] SQL policy warnings:', policy.warnings);
    }
  } catch (err: unknown) {
    if (err instanceof SqlPolicyError) {
      console.warn('[sql_query_tool] Policy denied:', err.message);
      // rethrow for upper layer to categorize as POLICY_DENIED
      throw err;
    }
    throw err;
  }

  console.log(`[sql_query_tool] Executing query:`, normalizedSql);
  try {
    const result = await executeQuery(normalizedSql);
    console.log(`[sql_query_tool] Query result:`, result);
    return result;
  } catch (error: unknown) {
    console.error(`[sql_query_tool] Error executing query:`, error);

    if (error instanceof Error) {
      const columnNotFoundMatch =
        error.message.match(/Column \"([^\"]+)\" not found/i) ||
        error.message.match(/Unknown column '([^']+)'/i);
      if (columnNotFoundMatch && columnNotFoundMatch[1]) {
        const missingColumn = columnNotFoundMatch[1];
        throw new MissingColumnError(`The column '${missingColumn}' was not found in the table.`, missingColumn);
      }
    }

    throw error;
  }
};

/**
 * Used by the LLM when it determines it cannot answer the question based on the available data.
 */
export const cannot_answer_tool = async (_executeQuery: ExecuteQueryFunc, { explanation }: { explanation: string }): Promise<any> => {
  console.log(`[cannot_answer_tool] LLM determined it cannot answer. Explanation: ${explanation}`);
  throw new CannotAnswerError(explanation);
};


// --- Tool Registry and Schema ---

export const tools: Record<string, (executeQuery: ExecuteQueryFunc, params: any) => Promise<any>> = {
  sql_query_tool,
  cannot_answer_tool,
};

export const toolSchemas = [
  {
    tool: "sql_query_tool",
    description: "Executes a valid SQL query against the database to answer a user's question. Use this for any data retrieval or calculation.",
    params: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "A complete and valid SQL query to run on the available tables.",
        },
      },
      required: ["query"],
    },
  },
  {
    tool: "cannot_answer_tool",
    description: "Call this tool if you determine that the user's question cannot be answered with the available tables and columns. Provide a clear explanation.",
    params: {
      type: "object",
      properties: {
        explanation: {
          type: "string",
          description: "A clear and concise explanation to the user about why their question cannot be answered. For example, mention which specific columns are missing.",
        },
      },
      required: ["explanation"],
    },
  },
];
