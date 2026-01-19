import { ExecuteQueryFunc } from '../llm/agentExecutor.ts'; // 导入类型

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
export const sql_query_tool = async (executeQuery: ExecuteQueryFunc, { query }: { query: string }): Promise<any> => {
  console.log(`[sql_query_tool] Executing query:`, query);
  try {
    const result = await executeQuery(query);
    console.log(`[sql_query_tool] Query result:`, result);
    return result;
  } catch (error: any) {
    console.error(`[sql_query_tool] Error executing query:`, error);
    
    const columnNotFoundMatch = error.message.match(/Column "([^"]+)" not found/i) || error.message.match(/Unknown column '([^']+)'/i);
    if (columnNotFoundMatch && columnNotFoundMatch[1]) {
      const missingColumn = columnNotFoundMatch[1];
      throw new MissingColumnError(`The column '${missingColumn}' was not found in the table.`, missingColumn);
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
