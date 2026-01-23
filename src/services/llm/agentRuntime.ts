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
import { AgentExecutor } from './agentExecutor.ts';

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
    // M5 minimal: one executor run. Multi-step loops can be added later.
    const executor = new AgentExecutor(runtime.llmConfig, runtime.executeQuery, runtime.attachments ?? []);

    const result = await executor.execute(userInput, abortController.signal, {
      persona: options?.personaId,
      sessionId: options?.sessionId,
    });

    const elapsed = performance.now() - start;
    if (elapsed > budget.maxDurationMs) {
      return { stopReason: 'BUDGET_EXCEEDED' };
    }

    return {
      stopReason: 'SUCCESS',
      tool: result.tool,
      params: result.params,
      result: result.result,
      schema: result.schema,
      thought: result.thought,
      llmDurationMs: result.llmDurationMs,
      queryDurationMs: result.queryDurationMs,
      cancelled: result.cancelled,
    };
  } catch (err: unknown) {
    if (abortController.signal.aborted) {
      return { stopReason: 'CANCELLED', cancelled: true, message: 'Cancelled.' };
    }

    const message = err instanceof Error ? err.message : 'Unknown error.';

    if (/Need clarification/i.test(message)) {
      return { stopReason: 'NEED_CLARIFICATION', message };
    }
    if (/Policy denied/i.test(message) || /POLICY_DENIED/i.test(message)) {
      return { stopReason: 'POLICY_DENIED', message };
    }

    return { stopReason: 'TOOL_ERROR', message };
  } finally {
    window.clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
};
