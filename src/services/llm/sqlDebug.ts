/**
 * SQL debug step.
 *
 * When a tool execution fails, we attempt a single automatic repair:
 * - Provide failed SQL + error message + schema digest
 * - Ask the model to return strict JSON: { patchedSql, explanation }
 *
 * Notes:
 * - The patched SQL will still go through sqlPolicy enforcement.
 */

import OpenAI from 'openai';
import { LlmClient, type LLMConfig } from './llmClient.ts';

export interface SqlDebugInput {
  failedSql: string;
  errorMessage: string;
  schemaDigest: string;
}

export interface SqlDebugResult {
  patchedSql: string;
  explanation: string;
}

const safeParseJsonObject = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * Attempts to repair a failed SQL query.
 *
 * @throws Error when the model output is not usable.
 */
export const debugSqlOnce = async (config: LLMConfig, input: SqlDebugInput): Promise<SqlDebugResult> => {
  const llm = new LlmClient(config);

  const system =
    'You are a SQL debugging engine for DuckDB. Output ONLY one valid JSON object. No markdown. No extra text.';

  const user = `Fix the SQL query based on the execution error.

Rules:
- Output MUST be a single JSON object.
- patchedSql must be DuckDB-compatible.
- IMPORTANT: Use double quotes for identifiers (e.g., "column"). Do NOT use backticks.
- Do NOT use tables/columns outside the schema digest.
- Prefer minimal changes.
- If you see type errors involving TIMESTAMP WITH TIME ZONE and INTERVAL (e.g., "-(TIMESTAMP WITH TIME ZONE, INTERVAL)"), fix it by explicitly casting to TIMESTAMP or DATE before subtracting intervals.
  Examples:
  - CAST("ts" AS TIMESTAMP) - INTERVAL '30 days'
  - CAST("ts" AS DATE) >= CURRENT_DATE - INTERVAL '30 days'

Return schema:
{
  "patchedSql": string,
  "explanation": string
}

Failed SQL:
${input.failedSql}

Error message:
${input.errorMessage}

Schema digest:
${input.schemaDigest}
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
  if (typeof content !== 'string') {
    throw new Error('SQL debug failed: empty model response.');
  }

  const parsed = safeParseJsonObject(content);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('SQL debug failed: model output is not valid JSON.');
  }

  const obj = parsed as Partial<SqlDebugResult>;
  const patchedSql = typeof obj.patchedSql === 'string' ? obj.patchedSql.trim() : '';
  const explanation = typeof obj.explanation === 'string' ? obj.explanation.trim() : '';

  if (!patchedSql) {
    throw new Error('SQL debug failed: patchedSql is empty.');
  }

  return {
    patchedSql,
    explanation: explanation || 'Auto-repaired the SQL based on the error message.',
  };
};
