
/**
 * Persona-specific suggestions configuration
 * Provides tailored analysis suggestions based on user persona
 */

export interface PersonaSuggestions {
  [personaId: string]: string[];
}

/**
 * E-commerce scenario suggestions for different personas
 */
export const ecommercePersonaSuggestions: PersonaSuggestions = {
  // Data Analyst: Technical and detailed analysis queries
  data_analyst: [
    'Show me the SQL query to calculate daily revenue trends',
    'Analyze sales data distribution using statistical methods',
    'Calculate correlation between product categories and sales',
    'Generate monthly cohort analysis for user retention',
    'Show quartile distribution of order amounts'
  ],

  // Business User: KPI-focused and actionable insights
  business_user: [
    'What are the top 10 selling products this month?',
    'Show me the sales trend for the past 3 months',
    'Which product categories have the highest revenue?',
    'Analyze customer purchase frequency distribution',
    'Compare sales performance across different regions'
  ],

  // Product Manager: User behavior and feature performance
  product_manager: [
    'Analyze user purchase funnel conversion rates',
    'Show user retention rate over time',
    'Which features drive the most user engagement?',
    'Analyze cart abandonment patterns',
    'Compare new vs returning user behavior'
  ]
};

/**
 * Get suggestions for a specific persona
 * Falls back to business_user if persona not found
 */
export const getPersonaSuggestions = (personaId: string): string[] => {
  return ecommercePersonaSuggestions[personaId] || ecommercePersonaSuggestions.business_user;
};