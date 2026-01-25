import { ecommercePrompts } from '../../prompts/ecommerce'; // Direct import for simplicity
import { Attachment } from '../../types/workbench.types';
import { UserPersona } from '../../types/persona';
import { getPersonaSuggestions } from '../../config/personaSuggestions';
import { promptPackLoader } from './promptPackLoader';
import { buildUserSkillDigest } from './skills/core/digestBuilder';
import type { UserSkillConfig } from './skills/types';

// Define a more structured prompt template
interface PromptTemplate {
  system_prompt: string;
  tool_selection_prompt_template: string;
  suggestions: string[];
}

// A record to hold different prompt sets by role
const promptSets: Record<string, PromptTemplate> = {
  ecommerce: ecommercePrompts,
  // finance: financePrompts, // Future extension
};

export class PromptManager {

  /**
   * Gets prompt suggestions for a given user role and persona.
   * @param role The role of the user (e.g., 'ecommerce').
   * @param personaId Optional persona ID to get personalized suggestions
   * @returns A list of suggestion strings.
   */
  public getSuggestions(role: string, personaId?: string): string[] {
    // If personaId provided, return persona-specific suggestions
    if (personaId) {
      return getPersonaSuggestions(personaId);
    }

    // Fallback to role-based suggestions
    const prompts = promptSets[role.toLowerCase()];
    if (!prompts) {
      console.warn(`No prompt template found for role: ${role}`);
      return [];
    }
    return prompts.suggestions;
  }

  /**
   * Constructs the full prompt for the LLM, including system message and tool selection guidance.
   * @param role The role of the user, to select the correct prompt set.
   * @param userInput The user's natural language query.
   * @param tableSchema The schema of the table(s) to be analyzed.
   * @param attachments The list of loaded file attachments for context.
   * @param persona Optional user persona to tailor the prompt.
   * @param industry Optional industry identifier to load System Skill Pack.
   * @param userSkillConfig Optional user skill configuration for digest injection.
   * @param activeTable Optional active table name for digest generation.
   * @returns The fully constructed prompt string.
   */
  public async getToolSelectionPrompt(
    role: string, 
    userInput: string, 
    tableSchema: string, 
    attachments: Attachment[] = [],
    persona?: UserPersona,
    industry?: string,
    userSkillConfig?: UserSkillConfig,
    activeTable?: string
  ): Promise<string> {
    const prompts = promptSets[role.toLowerCase()];
    if (!prompts) {
      throw new Error(`Prompt set for role "${role}" not found.`);
    }

    // Step 3: Load System Skill Pack if industry is provided
    let systemSkillPack = '';
    if (industry) {
      try {
        const pack = await promptPackLoader.load(industry, 'v1_compact');
        systemSkillPack = promptPackLoader.trimToBudget(pack, 2000);
        console.log(`[PromptManager] Loaded System Skill Pack: ${industry} (${systemSkillPack.length} chars)`);
      } catch (error) {
        console.warn(`[PromptManager] Failed to load System Skill Pack for ${industry}:`, error);
        // Continue without skill pack (non-blocking)
      }
    }

    // Step 4: Build User Skill Digest if config and active table are provided
    let userSkillDigest = '';
    if (userSkillConfig && activeTable) {
      try {
        userSkillDigest = buildUserSkillDigest(userSkillConfig, activeTable);
        console.log(`[PromptManager] Built User Skill Digest for ${activeTable} (${userSkillDigest.length} chars)`);
      } catch (error) {
        console.warn(`[PromptManager] Failed to build User Skill Digest:`, error);
        // Continue without digest (non-blocking)
      }
    }

    let personaContext = '';
    if (persona) {
      personaContext = `
        【User Context】
        Role: ${persona.displayName}
        Description: ${persona.description}
        Expertise: ${persona.expertise.join(', ')}

        Please tailor your analysis and response style according to this user's background:
        - For data analysts: provide detailed technical insights, SQL explanations, and statistical metrics
        - For business users: focus on business KPIs, trends, and actionable recommendations with simple explanations
        - For product managers: emphasize user behavior insights, feature performance, and data-driven product decisions
        `;
    }

    // Build a context string from attachments
    let fileContext = '';
    if (attachments.length > 0) {
      const fileInfos = attachments.map(att => {
        if (att.sheetName) {
          return `table "${att.tableName}" contains data from sheet "${att.sheetName}" of the file "${att.file.name}"`;
        }
        return `table "${att.tableName}" contains data from the file "${att.file.name}"`;
      });
      fileContext = `The user has loaded the following data: ${fileInfos.join('; ')}.`;
    }

    // Step 5: Assemble prompt in new order
    // Order: System Prompt → Skill Pack → User Digest → Persona → File Context → Tool Template
    const parts: string[] = [];
    
    // 1. System Prompt (always present)
    parts.push(prompts.system_prompt);
    
    // 2. System Skill Pack (if loaded)
    if (systemSkillPack) {
      parts.push('---\n【Industry Knowledge Pack】\n' + systemSkillPack);
    }
    
    // 3. User Skill Digest (if generated)
    if (userSkillDigest) {
      parts.push('---\n【User Domain Configuration】\n' + userSkillDigest);
    }
    
    // 4. Persona Context (if provided)
    if (personaContext) {
      parts.push('---' + personaContext);
    }
    
    // 5. File Context (if any)
    if (fileContext) {
      parts.push('---\n' + fileContext);
    }
    
    // 6. Tool Template
    parts.push('---\n' + prompts.tool_selection_prompt_template);
    
    // Combine all parts
    let fullPrompt = parts.join('\n\n');

    // Replace placeholders in the template
    fullPrompt = fullPrompt.replace('{userInput}', userInput);
    fullPrompt = fullPrompt.replace('{tableSchema}', tableSchema);

    console.log("[PromptManager] Constructed Full Prompt:", fullPrompt.slice(0, 500) + '...'); // Log first 500 chars
    console.log(`[PromptManager] Total prompt length: ${fullPrompt.length} chars`);
    return fullPrompt;
  }
}
