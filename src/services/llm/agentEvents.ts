/**
 * Agent event stream used for observability and UI step visualization.
 *
 * Notes:
 * - Keep payloads small. Never emit raw row data or user file content.
 * - This module is intentionally framework-agnostic.
 */

export type AgentErrorCategory =
  | 'QUERY_MISUNDERSTOOD'
  | 'SCHEMA_INSUFFICIENT'
  | 'SQL_SYNTAX_ERROR'
  | 'UNKNOWN_COLUMN_OR_TABLE'
  | 'SEMANTIC_MISMATCH'
  | 'POLICY_DENIED'
  | 'TOOL_ERROR'
  | 'LLM_ERROR'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface AgentBaseEvent {
  /** Unique agent run id, stable across the whole run. */
  runId: string;
  /** Optional session id (if the UI has a session concept). */
  sessionId?: string;
  /** Epoch milliseconds. */
  ts: number;
}

export interface AgentRunStartEvent extends AgentBaseEvent {
  type: 'agent.run.start';
  userInput: string;
  personaId?: string;
  tableNames?: string[];
}

export interface AgentRunEndEvent extends AgentBaseEvent {
  type: 'agent.run.end';
  ok: boolean;
  stopReason?: 'SUCCESS' | 'NEED_CLARIFICATION' | 'BUDGET_EXCEEDED' | 'POLICY_DENIED' | 'TOOL_ERROR' | 'CANCELLED' | 'UNKNOWN';
  errorCategory?: AgentErrorCategory;
  errorMessage?: string;
  llmDurationMs?: number;
  queryDurationMs?: number;
}

export interface AgentSchemaEvent extends AgentBaseEvent {
  type: 'agent.schema.ready';
  tableNames: string[];
}

export interface AgentToolCallEvent extends AgentBaseEvent {
  type: 'agent.tool.call';
  toolName: string;
  /** Non-sensitive args summary. Avoid embedding row data. */
  argsPreview?: string;
}

export interface AgentToolResultEvent extends AgentBaseEvent {
  type: 'agent.tool.result';
  toolName: string;
  rowCount?: number;
  columns?: string[];
  queryDurationMs?: number;
}

export interface AgentErrorEvent extends AgentBaseEvent {
  type: 'agent.error';
  errorCategory: AgentErrorCategory;
  errorMessage: string;
  /** Raw model output snippet for debugging parser issues (limited length). */
  rawModelOutputSnippet?: string;
}

export type AgentEvent =
  | AgentRunStartEvent
  | AgentSchemaEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentErrorEvent
  | AgentRunEndEvent;

export type AgentEventListener = (event: AgentEvent) => void;

let currentListener: AgentEventListener | null = null;

/**
 * Sets a single global agent event listener.
 *
 * This is deliberately simple for the first iteration.
 * In future, it can be extended to multiple listeners.
 */
export const setAgentEventListener = (listener: AgentEventListener | null): void => {
  currentListener = listener;
};

/**
 * Emits an agent event. Safe to call even if no listener is set.
 */
export const emitAgentEvent = (event: AgentEvent): void => {
  if (!currentListener) return;
  try {
    currentListener(event);
  } catch (err) {
    // Do not throw from telemetry.
    console.warn('[AgentEvents] Listener threw an error:', err);
  }
};
