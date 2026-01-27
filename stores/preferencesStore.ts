import { create } from "zustand";
import { supabase } from "../lib/supabase";

interface PreferencesState {
  hasPreferences: boolean | null;
  loading: boolean;

  checkPreferences: (userId: string) => Promise<void>;
  markPreferencesComplete: () => void;
  reset: () => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  hasPreferences: null,
  loading: false,

  checkPreferences: async (userId: string) => {
    set({ loading: true });

    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("id")
        .eq("user_id", userId)
        .single();

      set({
        hasPreferences: !!data && !error,
        loading: false,
      });
    } catch (error) {
      console.log("No preferences found");
      set({ hasPreferences: false, loading: false });
    }
  },

  markPreferencesComplete: () => {
    set({ hasPreferences: true });
  },

  reset: () => {
    set({ hasPreferences: null, loading: false });
  },
}));
