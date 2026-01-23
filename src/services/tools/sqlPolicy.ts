/**
 * SQL Policy enforcement for DuckDB queries.
 *
 * Goals:
 * - Read-only: allow SELECT / WITH ... SELECT
 * - Deny multi-statement SQL
 * - Deny DDL/DML keywords
 * - Restrict referenced tables to an allowlist
 * - Enforce a max LIMIT
 *
 * Notes:
 * - This is a lightweight guard and does not aim to be a full SQL parser.
 * - It is designed to cover the most common bypasses with minimal complexity.
 */

export interface SqlPolicyOptions {
  allowedTables: readonly string[];
  /** Max number of rows allowed to return. */
  maxRows: number;
}

export interface SqlPolicyResult {
  normalizedSql: string;
  warnings: string[];
}

export class SqlPolicyError extends Error {
  public readonly reason: string;

  constructor(message: string, reason: string) {
    super(message);
    this.name = 'SqlPolicyError';
    this.reason = reason;
  }
}

const WRITE_KEYWORDS = [
  'insert',
  'update',
  'delete',
  'drop',
  'alter',
  'create',
  'attach',
  'detach',
  'copy',
  'export',
  'pragma',
  'vacuum',
] as const;

const stripSqlComments = (sql: string): string => {
  // Remove block comments and line comments.
  const withoutBlock = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const withoutLine = withoutBlock.replace(/--.*$/gm, ' ');
  return withoutLine;
};

const normalizeWhitespace = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

const hasMultipleStatements = (sql: string): boolean => {
  // After stripping comments, disallow semicolons except at very end.
  const s = sql.trim();
  const first = s.indexOf(';');
  if (first === -1) return false;
  // allow trailing semicolon(s) only
  return s.slice(first).trim() !== ';';
};

const isSelectLikeStatement = (sql: string): boolean => {
  const lowered = sql.trim().toLowerCase();
  return lowered.startsWith('select') || lowered.startsWith('with');
};

const containsWriteKeyword = (sql: string): string | null => {
  const lowered = sql.toLowerCase();
  for (const kw of WRITE_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(lowered)) return kw;
  }
  return null;
};

const extractTableIdentifiers = (sql: string): string[] => {
  // Very lightweight extraction: FROM <ident> and JOIN <ident>
  // Handles quoted identifiers: "table" or `table`
  const identifiers: string[] = [];
  const re = /\b(from|join)\s+(("[^"]+"|`[^`]+`|\[[^\]]+\]|[a-zA-Z_][\w$]*)(\.[a-zA-Z_][\w$]*)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const raw = m[2];
    const cleaned = raw
      .trim()
      .replace(/^"|"$/g, '')
      .replace(/^`|`$/g, '')
      .replace(/^\[|\]$/g, '');
    // For schema-qualified, use last segment.
    const parts = cleaned.split('.');
    const tableName = parts[parts.length - 1] ?? cleaned;
    if (tableName) identifiers.push(tableName);
  }
  return Array.from(new Set(identifiers));
};

const enforceLimit = (sql: string, maxRows: number): { sql: string; warnings: string[] } => {
  const warnings: string[] = [];

  // If there is already a LIMIT, clamp it.
  const limitRe = /\blimit\s+(\d+)\b/i;
  const match = sql.match(limitRe);
  if (!match) {
    warnings.push(`LIMIT was not specified. Added LIMIT ${maxRows}.`);
    return { sql: `${sql} LIMIT ${maxRows}`, warnings };
  }

  const limitValue = Number(match[1]);
  if (!Number.isFinite(limitValue) || limitValue <= 0) {
    warnings.push(`Invalid LIMIT value. Replaced with LIMIT ${maxRows}.`);
    return { sql: sql.replace(limitRe, `LIMIT ${maxRows}`), warnings };
  }

  if (limitValue > maxRows) {
    warnings.push(`LIMIT ${limitValue} exceeded maxRows. Clamped to LIMIT ${maxRows}.`);
    return { sql: sql.replace(limitRe, `LIMIT ${maxRows}`), warnings };
  }

  return { sql, warnings };
};

const normalizeIdentifiers = (sql: string): string => {
  // DuckDB expects identifiers quoted with double quotes.
  // Many models output MySQL-style backticks. Convert `col` -> "col".
  // This is a best-effort transform and runs after comment stripping.
  return sql.replace(/`([^`]+)`/g, '"$1"');
};

const normalizeTimestampIntervalArithmetic = (sql: string): { sql: string; changed: boolean } => {
  // DuckDB may throw Binder Error for -(TIMESTAMP WITH TIME ZONE, INTERVAL).
  // Best-effort fix:
  // 1) Wrap `<identifier> - INTERVAL '...'` as `CAST(<identifier> AS TIMESTAMP) - INTERVAL '...'`.
  // 2) Wrap `CURRENT_TIMESTAMP - INTERVAL '...'` similarly because CURRENT_TIMESTAMP is TIMESTAMPTZ.

  let changed = false;

  // Case 1: identifier or quoted identifier
  const reIdent = /\b([a-zA-Z_][\w$]*|"[^"]+")\s*-\s*INTERVAL\s*'[^']+'\b/gi;
  let patched = sql.replace(reIdent, (m, left: string) => {
    if (/\bcast\s*\(/i.test(m)) return m;
    changed = true;
    const rhs = m.split(/\bINTERVAL\b/i)[1];
    return `CAST(${left} AS TIMESTAMP) - INTERVAL${rhs}`;
  });

  // Case 2: CURRENT_TIMESTAMP literal keyword
  const reCurrentTs = /\bCURRENT_TIMESTAMP\s*-\s*INTERVAL\s*'[^']+'\b/gi;
  patched = patched.replace(reCurrentTs, (m) => {
    if (/\bcast\s*\(/i.test(m)) return m;
    changed = true;
    const rhs = m.split(/\bINTERVAL\b/i)[1];
    return `CAST(CURRENT_TIMESTAMP AS TIMESTAMP) - INTERVAL${rhs}`;
  });

  return { sql: patched, changed };
};

/**
 * Validates and normalizes SQL according to policy.
 *
 * @param inputSql user/model provided SQL
 * @param options policy options
 * @returns normalized SQL + warnings
 * @throws SqlPolicyError if policy is violated
 */
export const validateAndNormalizeSql = (inputSql: string, options: SqlPolicyOptions): SqlPolicyResult => {
  const warnings: string[] = [];

  const stripped = stripSqlComments(inputSql);
  const normalizedIdentifiers = normalizeIdentifiers(stripped);

  const tsFix = normalizeTimestampIntervalArithmetic(normalizedIdentifiers);
  if (tsFix.changed) {
    warnings.push('Applied TIMESTAMPTZ-INTERVAL normalization (CAST to TIMESTAMP).');
  }

  const normalized = normalizeWhitespace(tsFix.sql);

  if (!normalized) {
    throw new SqlPolicyError('SQL is empty after normalization.', 'EMPTY_SQL');
  }

  if (hasMultipleStatements(normalized)) {
    throw new SqlPolicyError('Policy denied: multi-statement SQL is not allowed.', 'MULTI_STATEMENT');
  }

  if (!isSelectLikeStatement(normalized)) {
    throw new SqlPolicyError('Policy denied: only SELECT queries are allowed.', 'NOT_SELECT');
  }

  const forbidden = containsWriteKeyword(normalized);
  if (forbidden) {
    throw new SqlPolicyError(`Policy denied: keyword '${forbidden}' is not allowed.`, 'WRITE_KEYWORD');
  }

  const referencedTables = extractTableIdentifiers(normalized);
  if (referencedTables.length > 0) {
    const allowedSet = new Set(options.allowedTables);
    const denied = referencedTables.filter((t) => !allowedSet.has(t));
    if (denied.length > 0) {
      throw new SqlPolicyError(`Policy denied: table(s) not allowed: ${denied.join(', ')}`, 'TABLE_NOT_ALLOWED');
    }
  }

  const limited = enforceLimit(normalized, options.maxRows);
  warnings.push(...limited.warnings);

  return {
    normalizedSql: limited.sql,
    warnings,
  };
};
