interface PromptTemplate {
  title: string;
  suggestions: string[];
}

export class PromptManager {
  private promptTemplates: Record<string, () => Promise<{ [key: string]: PromptTemplate }>> = {
    ecommerce: () => import('../../prompts/ecommerce'),
    // software: () => import('../../prompts/software'), // Example for future extension
  };

  /**
   * Gets prompt suggestions for a given user role.
   * @param role The role of the user (e.g., 'ecommerce').
   * @returns A promise that resolves to a list of suggestion strings.
   */
  public async getSuggestions(role: string): Promise<string[]> {
    const loader = this.promptTemplates[role.toLowerCase()];
    if (!loader) {
      console.warn(`No prompt template found for role: ${role}`);
      return [];
    }
    
    try {
      const module = await loader();
      // The module is expected to have an exported object, e.g., `ecommercePrompts`
      const templateKey = Object.keys(module)[0];
      if (templateKey && module[templateKey]) {
        return module[templateKey].suggestions;
      }
    } catch (error) {
      console.error(`Failed to load prompt template for role: ${role}`, error);
    }

    return [];
  }

  /**
   * Gets the main prompt for the LLM to select a tool.
   * @param userInput The user's natural language query.
   * @param tableSchema The schema of the table to be analyzed.
   * @param availableTools A description of the available tools.
   * @returns The fully constructed prompt string.
   */
  public getToolSelectionPrompt(userInput: string, tableSchema: any, availableTools: string): string {
    const schemaString = JSON.stringify(tableSchema, null, 2);

    return `
You are an expert data analyst assistant. Your task is to help the user analyze their data by selecting the correct tool and parameters.

The user has loaded a table with the following schema:
\`\`\`json
${schemaString}
\`\`\`

The user's request is: "${userInput}"

Here are the available tools you can use:
\`\`\`json
${availableTools}
\`\`\`

Based on the user's request and the table schema, please respond with a single JSON object that specifies the tool to use and the parameters to pass to it.
Your response should be a valid JSON object and nothing else.

Example:
If the user asks "What is the highest price?", and the schema contains a "price" column, your response should be:
{
  "tool": "findMax",
  "params": {
    "column": "price"
  }
}
`;
  }
}
