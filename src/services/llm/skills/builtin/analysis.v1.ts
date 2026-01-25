import { z } from 'zod';
import type { SkillContext, SkillDefinition, SkillResult } from '../types';
import { AgentExecutor } from '../../agentExecutor';
import { classifyQueryType } from '../queryTypeRouter';
import { compileWhereClause } from '../core/filterCompiler';

type QueryType =
  | 'kpi_single'
  | 'kpi_grouped'
  | 'trend_time'
  | 'distribution'
  | 'comparison'
  | 'topn'
  | 'clarification_needed';

const classifyResultSchema = z.object({
  thought: z.string().optional(),
  queryType: z.enum(['kpi_single', 'kpi_grouped', 'trend_time', 'distribution', 'comparison', 'topn', 'clarification_needed']),
  /** Candidate columns chosen by the model (best-effort). */
  timeColumn: z.string().optional(),
  metricColumn: z.string().optional(),
  dimensionColumn: z.string().optional(),
  /** If clarification is required, ask these questions. */
  clarifyingQuestions: z.array(z.string()).default([]),
});

const buildFallbackClarificationMessage = (): SkillResult => {
  return {
    stopReason: 'NEED_CLARIFICATION',
    message: 'Need clarification:\n- 请补充你希望统计的时间范围（例如：最近7天/30天），以及用于过滤的时间字段名称。',
  };
};

const safeQuoteIdent = (name: string): string => {
  const trimmed = name.trim();
  // Use backticks for DuckDB identifier quoting (consistent with existing code paths).
  return '`' + trimmed.replace(/`/g, '``') + '`';
};

const chooseFirstMatchingColumn = (schemaDigest: string, candidates: string[]): string | null => {
  const normalizedDigest = schemaDigest.toLowerCase();
  for (const c of candidates) {
    if (!c) continue;
    if (normalizedDigest.includes(c.toLowerCase())) return c;
  }
  return null;
};

const guessTimeColumn = (schemaDigest: string): string | null => {
  return (
    chooseFirstMatchingColumn(schemaDigest, ['下单时间', '支付时间', '创建时间', 'order_time', 'created_at', 'create_at', 'timestamp', 'date']) ||
    null
  );
};

const guessAmountColumn = (schemaDigest: string): string | null => {
  return chooseFirstMatchingColumn(schemaDigest, ['实付金额', '支付金额', '订单金额', 'amount', 'price', 'total']) || null;
};

const buildSqlByQueryType = (tableName: string, queryType: QueryType, cols: {
  timeColumn?: string;
  metricColumn?: string;
  dimensionColumn?: string;
}, maxRows: number, whereClause?: string): string | null => {
  const limit = Math.max(1, Math.min(500, maxRows));

  if (queryType === 'kpi_single') {
    let sql = `SELECT COUNT(*) AS total_count FROM ${tableName}`;
    if (whereClause) sql += `\n${whereClause}`;
    return sql + `\nLIMIT ${limit}`;
  }

  if (queryType === 'kpi_grouped') {
    if (!cols.dimensionColumn) return null;
    const dim = safeQuoteIdent(cols.dimensionColumn);
    const parts = [
      `SELECT ${dim} AS dimension, COUNT(*) AS total_count`,
      `FROM ${tableName}`,
    ];
    if (whereClause) parts.push(whereClause);
    parts.push(
      `GROUP BY ${dim}`,
      `ORDER BY total_count DESC`,
      `LIMIT ${limit}`
    );
    return parts.join('\n');
  }

  if (queryType === 'trend_time') {
    if (!cols.timeColumn) return null;
    const ts = safeQuoteIdent(cols.timeColumn);
    const parts = [
      `SELECT DATE_TRUNC('day', CAST(${ts} AS TIMESTAMP)) AS day, COUNT(*) AS total_count`,
      `FROM ${tableName}`,
    ];
    if (whereClause) parts.push(whereClause);
    parts.push(
      `GROUP BY day`,
      `ORDER BY day`,
      `LIMIT ${limit}`
    );
    return parts.join('\n');
  }

  if (queryType === 'distribution') {
    if (!cols.metricColumn) return null;
    const x = safeQuoteIdent(cols.metricColumn);
    const parts = [
      `SELECT`,
      `  AVG(${x}) AS mean_value,`,
      `  MEDIAN(${x}) AS median_value,`,
      `  STDDEV_POP(${x}) AS stddev_value,`,
      `  MIN(${x}) AS min_value,`,
      `  MAX(${x}) AS max_value`,
      `FROM ${tableName}`,
    ];
    if (whereClause) parts.push(whereClause);
    return parts.join('\n') + `\nLIMIT ${limit}`;
  }

  if (queryType === 'topn') {
    // Fallback: show first rows
    let sql = `SELECT * FROM ${tableName}`;
    if (whereClause) sql += `\n${whereClause}`;
    return sql + `\nLIMIT ${limit}`;
  }

  // comparison: v1 keeps it simple ⇒ fallback to nl2sql.
  return null;
};

export const analysisV1Skill: SkillDefinition = {
  id: 'analysis.v1',
  description: 'General purpose data analysis skill (v1): classify → template SQL → execute → summarize.',
  async run(ctx: SkillContext): Promise<SkillResult> {
    const llmStart = performance.now();
    try {
      const executor = new AgentExecutor(ctx.runtime.llmConfig, ctx.runtime.executeQuery, ctx.attachments);

      // Step 1: Use Query Type Router (Phase 1) instead of heuristic regex
      // Don't pass llmConfig if mockEnabled (for testing) to avoid real LLM calls
      const llmConfigForClassification = ctx.runtime.llmConfig.mockEnabled 
        ? undefined 
        : ctx.runtime.llmConfig;
      
      const classification = await classifyQueryType(
        ctx.userInput,
        llmConfigForClassification,
        ctx.schemaDigest
      );
      let queryType = classification.queryType as QueryType;
      
      console.log(`[analysis.v1] Query classified as: ${queryType} (confidence: ${classification.confidence})`);

      // Step 2: Get table config and field mapping (Phase 3)
      const tableName = ctx.activeTable ?? 'main_table_1';
      const tableConfig = ctx.userSkillConfig?.tables[tableName];
      const fieldMapping = tableConfig?.fieldMapping;

      console.log(`[analysis.v1] Using table: ${tableName}, has config: ${!!tableConfig}`);

      // Step 3: Use Field Mapping with fallback to guessing
      const timeColumn = fieldMapping?.timeColumn 
        ?? guessTimeColumn(ctx.schemaDigest) 
        ?? undefined;
      
      const metricColumn = fieldMapping?.amountColumn 
        ?? guessAmountColumn(ctx.schemaDigest) 
        ?? undefined;

      // Dimension column: try to use orderIdColumn or userIdColumn as dimension for grouped queries
      let dimensionColumn: string | undefined;
      if (queryType === 'kpi_grouped') {
        dimensionColumn = chooseFirstMatchingColumn(
          ctx.schemaDigest, 
          ['渠道', '地区', '类目', 'category', 'channel', 'region']
        ) ?? undefined;
      }

      console.log(`[analysis.v1] Columns: time=${timeColumn}, metric=${metricColumn}, dimension=${dimensionColumn}`);

      // If time-related query but no time column, ask for clarification.
      if (queryType === 'trend_time' && !timeColumn) {
        const llmDurationMs = performance.now() - llmStart;
        return {
          stopReason: 'NEED_CLARIFICATION',
          message: 'Need clarification:\n- 请选择用于趋势统计的时间字段（例如：下单时间/支付时间/创建时间）。',
          llmDurationMs,
        };
      }

      // Step 4: Compile default filters (Phase 3)
      const defaultFilters = tableConfig?.defaultFilters;
      const whereClause = defaultFilters ? compileWhereClause(defaultFilters) : undefined;
      
      if (whereClause) {
        console.log(`[analysis.v1] Applying default filters: ${whereClause}`);
      }

      // Step 5: Build SQL with where clause
      const sql = buildSqlByQueryType(
        tableName,
        queryType,
        { timeColumn, metricColumn, dimensionColumn },
        ctx.maxRows,
        whereClause
      );

      // If we can't produce a safe template, fall back to nl2sql.
      if (!sql || queryType === 'comparison') {
        console.log(`[analysis.v1] Falling back to nl2sql for queryType: ${queryType}`);
        // Fallback: existing executor path (nl2sql) already includes rewrite/sql-debug/policy.
        const res = await executor.execute(ctx.userInput, ctx.runtime.signal, {
          persona: ctx.personaId,
          sessionId: ctx.sessionId,
          // M10.4 Phase 4: Pass user skill config
          industry: ctx.industry,
          userSkillConfig: ctx.userSkillConfig,
          activeTable: ctx.activeTable,
        });
        const llmDurationMs = typeof res.llmDurationMs === 'number' ? res.llmDurationMs : performance.now() - llmStart;
        return {
          stopReason: 'SUCCESS',
          tool: res.tool,
          params: res.params,
          result: res.result,
          schema: res.schema,
          thought: res.thought,
          llmDurationMs,
          queryDurationMs: res.queryDurationMs,
          cancelled: res.cancelled,
        };
      }

      console.log(`[analysis.v1] Executing SQL:\n${sql}`);

      const queryStart = performance.now();
      const queryRes = await ctx.runtime.executeQuery(sql);
      const queryDurationMs = performance.now() - queryStart;
      const llmDurationMs = performance.now() - llmStart;

      return {
        stopReason: 'SUCCESS',
        tool: 'sql_query_tool',
        params: { query: sql },
        result: queryRes,
        schema: queryRes.schema,
        thought: `Classified as ${queryType}, executed template SQL`,
        llmDurationMs,
        queryDurationMs,
      };
    } catch (e: unknown) {
      const llmDurationMs = performance.now() - llmStart;
      if (e instanceof Error) {
        return {
          stopReason: /Need clarification/i.test(e.message) ? 'NEED_CLARIFICATION' : 'TOOL_ERROR',
          message: e.message,
          llmDurationMs,
        };
      }
      return { ...buildFallbackClarificationMessage(), llmDurationMs };
    }
  },
};

export const analysisV1ClassificationSchema = classifyResultSchema;
