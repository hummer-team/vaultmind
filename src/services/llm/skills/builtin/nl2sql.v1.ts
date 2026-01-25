import type { SkillContext, SkillDefinition, SkillResult } from '../types';
import { AgentExecutor } from '../../agentExecutor';

export const nl2sqlV1Skill: SkillDefinition = {
  id: 'nl2sql.v1',
  description: 'Legacy NL2SQL skill (v1) backed by AgentExecutor.execute().',
  async run(ctx: SkillContext): Promise<SkillResult> {
    const executor = new AgentExecutor(ctx.runtime.llmConfig, ctx.runtime.executeQuery, ctx.attachments);
    const res = await executor.execute(ctx.userInput, ctx.runtime.signal, {
      persona: ctx.personaId,
      sessionId: ctx.sessionId,
      // M10.4 Phase 4: Pass user skill config
      industry: ctx.industry,
      userSkillConfig: ctx.userSkillConfig,
      activeTable: ctx.activeTable,
    });

    return {
      stopReason: 'SUCCESS',
      tool: res.tool,
      params: res.params,
      result: res.result,
      schema: res.schema,
      thought: res.thought,
      llmDurationMs: res.llmDurationMs,
      queryDurationMs: res.queryDurationMs,
      cancelled: res.cancelled,
    };
  },
};
