/**
 * Schema discovery step.
 *
 * This executes low-cost SQL queries to help the LLM avoid hallucinating columns.
 * It does NOT send sample rows to the LLM by default.
 */

import type { ExecuteQueryFunc } from './agentExecutor.ts';

export interface DiscoveredTable {
  tableName: string;
  columns: Array<{ name: string; type: string }>;
}

export interface SchemaDiscoveryResult {
  tables: DiscoveredTable[];
}

const isColumnRow = (row: unknown): row is { column_name?: unknown; column_type?: unknown } => {
  return typeof row === 'object' && row !== null && ('column_name' in row || 'column_type' in row);
};

/**
 * Discovers schemas for the given table names.
 */
export const discoverSchema = async (
  executeQuery: ExecuteQueryFunc,
  tableNames: readonly string[]
): Promise<SchemaDiscoveryResult> => {
  const tables: DiscoveredTable[] = [];

  for (const tableName of tableNames) {
    const res = await executeQuery(`DESCRIBE "${tableName}";`);
    const columns = (res.data ?? [])
      .filter(isColumnRow)
      .map((r) => {
        const name = typeof r.column_name === 'string' ? r.column_name : 'unknown_column';
        const type = typeof r.column_type === 'string' ? r.column_type : 'unknown_type';
        return { name, type };
      });

    tables.push({ tableName, columns });
  }

  return { tables };
};

/**
 * Builds a compact schema digest string for prompt usage.
 */
export const formatSchemaDigest = (discovery: SchemaDiscoveryResult): string => {
  return discovery.tables
    .map((t) => {
      const cols = t.columns.map((c) => `${c.name}:${c.type}`).join(', ');
      return `Table ${t.tableName}: ${cols}`;
    })
    .join('\n');
};
