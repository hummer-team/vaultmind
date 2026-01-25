/**
 * Agent runtime with budgets.
 *
 * M5 goal: provide a minimal loop driver around AgentExecutor-like logic,
 * but keep behavior conservative (single tool call + optional one SQL debug).
 *
 * Next iterations can expand to multi-tool workflows.
 */

import type { Attachment } from '../../types/workbench.types';
import type { ExecuteQueryFunc } from './agentExecutor.ts';
import { ensureSkillsRegistered } from './skills/index.ts';
import { resolveSkill } from './skills/router.ts';
import { userSkillService } from '../userSkill/userSkillService';

export type AgentStopReason =
  | 'SUCCESS'
  | 'NEED_CLARIFICATION'
  | 'BUDGET_EXCEEDED'
  | 'POLICY_DENIED'
  | 'TOOL_ERROR'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface AgentBudget {
  /** Maximum LLM steps (tool decisions). */
  maxSteps: number;
  /** Maximum tool calls allowed. */
  maxToolCalls: number;
  /** Maximum runtime duration in ms. */
  maxDurationMs: number;
}

export interface AgentRuntimeOptions {
  budget: AgentBudget;
  personaId?: string;
  sessionId?: string;
}

export interface AgentRunResult {
  stopReason: AgentStopReason;
  /** User-facing message (best-effort). */
  message?: string;
  tool?: string;
  params?: unknown;
  result?: unknown;
  schema?: unknown[];
  thought?: string;
  llmDurationMs?: number;
  queryDurationMs?: number;
  cancelled?: boolean;
}

export interface AgentRuntimeConfig {
  llmConfig: import('./llmClient.ts').LLMConfig;
  executeQuery: ExecuteQueryFunc;
  attachments?: Attachment[];
}

const DEFAULT_BUDGET: AgentBudget = {
  maxSteps: 2,
  maxToolCalls: 2,
  maxDurationMs: 20_000,
};

/**
 * Runs the agent with budget protections.
 *
 * Contract:
 * - Currently delegates to AgentExecutor.execute() (single-step agent) while enforcing timeouts.
 * - Returns stopReason for UI/telemetry.
 */
export const runAgent = async (
  runtime: AgentRuntimeConfig,
  userInput: string,
  signal?: AbortSignal,
  options?: Partial<AgentRuntimeOptions>
): Promise<AgentRunResult> => {
  const budget = options?.budget ?? DEFAULT_BUDGET;
  const start = performance.now();

  // M10.4 Phase 4: Load user skill config
  let userSkillConfig: import('./skills/types').UserSkillConfig | undefined;
  try {
    userSkillConfig = await userSkillService.loadUserSkill() ?? undefined;
    console.log('[agentRuntime] Loaded user skill config:', !!userSkillConfig);
  } catch (error) {
    console.warn('[agentRuntime] Failed to load user skill config:', error);
    // Continue without config (non-blocking)
  }

  // M10.4 Phase 4: Determine active table (single table for now)
  const activeTable = runtime.attachments?.[0]?.tableName ?? 'main_table_1';
  console.log('[agentRuntime] Active table:', activeTable);

  // M10.4 Phase 4: Extract industry from table config
  const tableConfig = userSkillConfig?.tables[activeTable];
  const industry = tableConfig?.industry;
  console.log('[agentRuntime] Industry:', industry, 'Has table config:', !!tableConfig);

  // M10: register skills once (lightweight)
  ensureSkillsRegistered();

  // Build a compact schema digest for skills (best-effort)
  const schemaDigest = await buildSchemaDigest(runtime.executeQuery);

  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  if (signal) {
    if (signal.aborted) abortController.abort();
    signal.addEventListener('abort', onAbort, { once: true });
  }

  const timeoutId = window.setTimeout(() => {
    abortController.abort();
  }, budget.maxDurationMs);

  try {
    // M10: skill routing (B1). If flags are off, router resolves to nl2sql.v1.
    const skill = resolveSkill({
      userInput,
      attachments: runtime.attachments ?? [],
      personaId: options?.personaId,
      sessionId: options?.sessionId,
      schemaDigest,
      maxRows: 500,
      runtime: {
        llmConfig: runtime.llmConfig,
        executeQuery: runtime.executeQuery,
        signal: abortController.signal,
      },
      // M10.4 Phase 4: Pass user skill config
      industry,
      userSkillConfig,
      activeTable,
    });

    if (!skill) {
      throw new Error('No skill resolved.');
    }

    const skillTag = `[Skill] ${skill.id}`;

    const result = await skill.run({
      userInput,
      attachments: runtime.attachments ?? [],
      personaId: options?.personaId,
      sessionId: options?.sessionId,
      schemaDigest,
      maxRows: 500,
      runtime: {
        llmConfig: runtime.llmConfig,
        executeQuery: runtime.executeQuery,
        signal: abortController.signal,
      },
      // M10.4 Phase 4: Pass user skill config
      industry,
      userSkillConfig,
      activeTable,
    });

    const elapsed = performance.now() - start;
    if (elapsed > budget.maxDurationMs) {
      return { stopReason: 'BUDGET_EXCEEDED' };
    }

    if (result.cancelled) {
      return { stopReason: 'CANCELLED', cancelled: true, message: 'Cancelled.', llmDurationMs: result.llmDurationMs, queryDurationMs: result.queryDurationMs };
    }

    if (result.stopReason !== 'SUCCESS') {
      return {
        stopReason: result.stopReason,
        message: result.message,
        llmDurationMs: result.llmDurationMs,
        queryDurationMs: result.queryDurationMs,
        thought: skillTag,
      };
    }

    return {
      stopReason: 'SUCCESS',
      tool: result.tool,
      params: result.params,
      result: result.result,
      schema: result.schema,
      thought: result.thought ? `${skillTag}\n${result.thought}` : skillTag,
      llmDurationMs: result.llmDurationMs,
      queryDurationMs: result.queryDurationMs,
      cancelled: result.cancelled,
    };
  } catch (err: unknown) {
    const maybeWithTiming = err as { llmDurationMs?: unknown; queryDurationMs?: unknown };
    const llmDurationMs = typeof maybeWithTiming.llmDurationMs === 'number' ? maybeWithTiming.llmDurationMs : undefined;
    const queryDurationMs =
      typeof maybeWithTiming.queryDurationMs === 'number' ? maybeWithTiming.queryDurationMs : undefined;

    if (abortController.signal.aborted) {
      return { stopReason: 'CANCELLED', cancelled: true, message: 'Cancelled.', llmDurationMs, queryDurationMs };
    }

    const message = err instanceof Error ? err.message : 'Unknown error.';

    if (/Need clarification/i.test(message)) {
      return { stopReason: 'NEED_CLARIFICATION', message, llmDurationMs, queryDurationMs };
    }
    if (/Policy denied/i.test(message) || /POLICY_DENIED/i.test(message)) {
      return { stopReason: 'POLICY_DENIED', message, llmDurationMs, queryDurationMs };
    }

    return { stopReason: 'TOOL_ERROR', message, llmDurationMs, queryDurationMs };
  } finally {
    window.clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
};

const buildSchemaDigest = async (executeQuery: ExecuteQueryFunc): Promise<string> => {
  try {
    const tablesRes = await executeQuery(
      "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'main_table_%' ORDER BY table_name;"
    );

    const tableNames = Array.isArray(tablesRes.data)
      ? tablesRes.data
        .map((row: unknown) => {
          if (typeof row === 'object' && row !== null && 'table_name' in row) {
            const v = (row as { table_name?: unknown }).table_name;
            return typeof v === 'string' ? v : '';
          }
          return '';
        })
        .filter((x) => x.length > 0)
      : [];

    const targets = tableNames.length > 0 ? tableNames : ['main_table_1'];

    const chunks: string[] = [];
    for (const t of targets) {
      const desc = await executeQuery(`DESCRIBE "${t}";`);
      const cols = Array.isArray(desc.data)
        ? desc.data
          .map((r: unknown) => {
            if (typeof r === 'object' && r !== null) {
              const rr = r as { column_name?: unknown; column_type?: unknown };
              const name = typeof rr.column_name === 'string' ? rr.column_name : '';
              const type = typeof rr.column_type === 'string' ? rr.column_type : '';
              if (!name) return '';
              return `${name} (${type || 'unknown'})`;
            }
            return '';
          })
          .filter((x) => x.length > 0)
        : [];

      chunks.push(`Table: ${t}\nColumns: ${cols.join(', ')}`);
    }

    return chunks.join('\n\n').slice(0, 4000);
  } catch (e) {
    console.warn('[agentRuntime] Failed to build schemaDigest:', e);
    return '';
  }
};
