import { DuckDBService } from '../DuckDBService';

const duckDBService = DuckDBService.getInstance();

// --- Tool Definitions ---

export const findMax = async ({ column }: { column: string }): Promise<any> => {
  const sql = `SELECT MAX("${column}") as max_value FROM main_table;`;
  return await duckDBService.executeQuery(sql);
};

export const sumByGroup = async ({ groupColumn, aggColumn }: { groupColumn: string, aggColumn: string }): Promise<any> => {
  const sql = `SELECT "${groupColumn}", SUM("${aggColumn}") as total FROM main_table GROUP BY "${groupColumn}" ORDER BY total DESC;`;
  return await duckDBService.executeQuery(sql);
};

// --- Tool Registry and Schema ---

export const tools: Record<string, (params: any) => Promise<any>> = {
  findMax,
  sumByGroup,
};

export const toolSchemas = [
  {
    tool: "findMax",
    description: "Finds the maximum value in a specific column.",
    params: {
      type: "object",
      properties: {
        column: {
          type: "string",
          description: "The name of the column to find the maximum value from.",
        },
      },
      required: ["column"],
    },
  },
  {
    tool: "sumByGroup",
    description: "Calculates the sum of a numeric column, grouped by a dimension column.",
    params: {
      type: "object",
      properties: {
        groupColumn: {
          type: "string",
          description: "The column to group the results by (e.g., 'city', 'category').",
        },
        aggColumn: {
          type: "string",
          description: "The numeric column to sum up (e.g., 'sales', 'revenue').",
        },
      },
      required: ["groupColumn", "aggColumn"],
    },
  },
];
