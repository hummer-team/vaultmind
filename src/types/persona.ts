/**
 * User persona interface representing user role and preferences
 */
export interface UserPersona {
    id: string;
    displayName: string;
    description: string;
    expertise: string[];
    icon?: string;
    preferredVisualization?: string[];
}