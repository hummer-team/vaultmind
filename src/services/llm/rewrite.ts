/**
 * Query rewrite layer.
 *
 * This turns raw user input into a structured directive that can be used to:
 * - decide task type
 * - decide whether schema discovery is needed
 * - reduce NL2SQL hallucinations
 */

import OpenAI from 'openai';
import { LlmClient, type LLMConfig } from './llmClient.ts';

export type RewriteTaskType = 'data_qna' | 'profiling' | 'sql_debug' | 'workflow';

export type RewriteRiskFlag =
  | 'ambiguous_column'
  | 'multiple_possible_tables'
  | 'time_range_missing'
  | 'needs_schema_discovery'
  | 'unknown';

export interface RewriteResult {
  taskType: RewriteTaskType;
  /** Optional target table scope. */
  tableScope: 'auto' | string[];
  /** 0..1 */
  confidence: number;
  riskFlags: RewriteRiskFlag[];
  assumptions: string[];
  needClarification: boolean;
  clarifyingQuestions: string[];
}

const clamp01 = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
};

const safeParseJsonObject = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const DEFAULT_REWRITE: RewriteResult = {
  taskType: 'data_qna',
  tableScope: 'auto',
  confidence: 0.5,
  riskFlags: ['unknown'],
  assumptions: [],
  needClarification: false,
  clarifyingQuestions: [],
};

/**
 * Executes rewrite.
 *
 * @param config LLM config
 * @param input user query
 * @param schemaDigest schema digest string (keep it small)
 */
export const rewriteQuery = async (config: LLMConfig, input: string, schemaDigest: string): Promise<RewriteResult> => {
  const llm = new LlmClient(config);

  const system =
    'You are a strict JSON rewriting engine. You must output ONLY one valid JSON object and nothing else.';

  const user = `Rewrite the user query into a compact JSON directive.

Rules:
- Output MUST be a single JSON object.
- Do not include markdown.
- confidence must be a number between 0 and 1.
- tableScope must be either "auto" or an array of table names.
- If columns/tables are unclear, set riskFlags to include "needs_schema_discovery".
- If information is missing to run any query, set needClarification=true and provide 1-3 clarifyingQuestions.

Return schema:
{
  "taskType": "data_qna" | "profiling" | "sql_debug" | "workflow",
  "tableScope": "auto" | string[],
  "confidence": number,
  "riskFlags": string[],
  "assumptions": string[],
  "needClarification": boolean,
  "clarifyingQuestions": string[]
}

User query:
${input}

Schema digest:
${schemaDigest}
`;

  const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model: llm.modelName,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  const resp = await llm.chatCompletions(params);
  const content = resp.choices[0]?.message?.content;
  if (typeof content !== 'string') return DEFAULT_REWRITE;

  const parsed = safeParseJsonObject(content);
  if (!parsed || typeof parsed !== 'object') return DEFAULT_REWRITE;

  const obj = parsed as Partial<RewriteResult>;

  const taskType: RewriteTaskType =
    obj.taskType === 'profiling' || obj.taskType === 'sql_debug' || obj.taskType === 'workflow'
      ? obj.taskType
      : 'data_qna';

  const tableScope: RewriteResult['tableScope'] =
    obj.tableScope === 'auto'
      ? 'auto'
      : Array.isArray(obj.tableScope)
        ? obj.tableScope.filter((t): t is string => typeof t === 'string')
        : 'auto';

  const riskFlags: RewriteRiskFlag[] = Array.isArray(obj.riskFlags)
    ? obj.riskFlags
        .map((f) => (typeof f === 'string' ? (f as RewriteRiskFlag) : 'unknown'))
        .filter((f) => f)
    : [];

  const assumptions = Array.isArray(obj.assumptions)
    ? obj.assumptions.filter((a): a is string => typeof a === 'string')
    : [];

  const clarifyingQuestions = Array.isArray(obj.clarifyingQuestions)
    ? obj.clarifyingQuestions.filter((q): q is string => typeof q === 'string')
    : [];

  return {
    taskType,
    tableScope,
    confidence: clamp01(typeof obj.confidence === 'number' ? obj.confidence : DEFAULT_REWRITE.confidence),
    riskFlags: riskFlags.length ? riskFlags : [],
    assumptions,
    needClarification: Boolean(obj.needClarification),
    clarifyingQuestions,
  };
};
