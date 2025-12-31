import { create } from 'zustand';

interface AppState {
  // Define application-level state
}

export const useAppStore = create<AppState>((_set) => ({
  // Initial state and actions
}));
