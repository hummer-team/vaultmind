import { create } from 'zustand';

interface SessionState {
  // Define session-specific state
}

export const useSessionStore = create<SessionState>((_set) => ({
  // Initial state and actions
}));
