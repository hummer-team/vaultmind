import { create } from 'zustand';
import { settingsService, UserProfile } from '../services/settingsService.ts';

interface UserState {
  userProfile: UserProfile | null;
  fetchUserProfile: () => Promise<void>;
  setUserProfile: (profile: UserProfile) => void;
}

export const useUserStore = create<UserState>((set) => ({
  userProfile: null,
  fetchUserProfile: async () => {
    try {
      const profile = await settingsService.getUserProfile();
      set({ userProfile: profile });
      console.log('[UserStore] User profile loaded:', profile);
    } catch (error) {
      console.error('[UserStore] Failed to fetch user profile:', error);
    }
  },
  setUserProfile: (profile: UserProfile) => {
    set({ userProfile: profile });
    console.log('[UserStore] User profile updated:', profile);
  },
}));
