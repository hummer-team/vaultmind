import { UserPersona } from '../types/persona';

export const dataAnalystPersona: UserPersona = {
    id: 'data_analyst',
    displayName: 'Data Analyst',
    description: 'Experienced with SQL and statistical analysis, requiring detailed data insights and technical metrics.',
    expertise: ['SQL', 'Statistical Analysis', 'Data Modeling', 'Data Visualization'],
    icon: '📊',
    preferredVisualization: ['scatter', 'heatmap', 'histogram']
};

export const businessUserPersona: UserPersona = {
    id: 'business_user',
    displayName: 'Business Operations',
    description: 'Focused on business metrics and trends, seeking clear conclusions and actionable recommendations.',
    expertise: ['Business Metrics', 'User Operations', 'KPI Monitoring', 'Data Reporting'],
    icon: '💼',
    preferredVisualization: ['line', 'bar', 'pie']
};

export const productManagerPersona: UserPersona = {
    id: 'product_manager',
    displayName: 'Product Manager',
    description: 'Focused on user behavior and product performance, requiring user insights and feature impact analysis.',
    expertise: ['User Behavior Analysis', 'A/B Testing', 'Funnel Analysis', 'Retention Analysis'],
    icon: '🎯',
    preferredVisualization: ['funnel', 'sankey', 'cohort']
};

export const personaRegistry: Record<string, UserPersona> = {
    data_analyst: dataAnalystPersona,
    business_user: businessUserPersona,
    product_manager: productManagerPersona
};

/**
 * Get persona by id, fallback to business_user if not found
 */
export const getPersonaById = (personaId: string | null): UserPersona => {
    if (!personaId || !personaRegistry[personaId]) {
        return businessUserPersona;
    }
    return personaRegistry[personaId];
};