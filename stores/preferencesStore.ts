import { create } from "zustand";
import { supabase } from "../lib/supabase";

// How long to wait for the preferences check before giving up
const PREFS_CHECK_TIMEOUT_MS = 6000;

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
      const timeout = new Promise<{ data: null; error: { code: string } }>(
        (resolve) =>
          setTimeout(
            () => resolve({ data: null, error: { code: "TIMEOUT" } }),
            PREFS_CHECK_TIMEOUT_MS
          )
      );

      const query = supabase
        .from("user_preferences")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      const { data, error } = await Promise.race([query, timeout]);

      if (error) {
        const code = (error as any).code;
        if (code === "PGRST116") {
          // Explicit "no rows" — user genuinely has no preferences
          set({ hasPreferences: false, loading: false });
        } else {
          // Network error, timeout, RLS failure etc. — don't assume no prefs.
          // Default to false so users aren't stuck on a spinner, but log it.
          console.warn("Preferences check failed, defaulting to false:", code);
          set({ hasPreferences: false, loading: false });
        }
        return;
      }

      set({ hasPreferences: !!data, loading: false });
    } catch (err) {
      console.warn("Preferences check threw unexpectedly:", err);
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
