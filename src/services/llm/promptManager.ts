import { ecommercePrompts } from '../../prompts/ecommerce'; // Direct import for simplicity
import { Attachment } from '../../types/workbench.types';
import { UserPersona } from '../../types/persona';
import { getPersonaSuggestions } from '../../config/personaSuggestions';

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
   * @returns The fully constructed prompt string.
   */
  public getToolSelectionPrompt(role: string, userInput: string, tableSchema: string, attachments: Attachment[] = []
    , persona?: UserPersona): string {
    const prompts = promptSets[role.toLowerCase()];
    if (!prompts) {
      throw new Error(`Prompt set for role "${role}" not found.`);
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

    // 1. Combine the system prompt and the main tool selection template
    let fullPrompt = `${prompts.system_prompt}${personaContext}\n\n${fileContext}\n\n${prompts.tool_selection_prompt_template}`;

    // 2. Replace placeholders in the template
    fullPrompt = fullPrompt.replace('{userInput}', userInput);
    fullPrompt = fullPrompt.replace('{tableSchema}', tableSchema);

    console.log("[PromptManager] Constructed Full Prompt:", fullPrompt); // For debugging
    return fullPrompt;
  }
}
