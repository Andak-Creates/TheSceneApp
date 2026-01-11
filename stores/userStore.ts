import { create } from "zustand";
import { supabase } from "../lib/supabase";

interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_host: boolean;
  created_at: string;
}

interface UserState {
  profile: Profile | null;
  loading: boolean;

  // Actions
  fetchProfile: (userId: string) => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: any }>;
  clearProfile: () => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  profile: null,
  loading: false,

  fetchProfile: async (userId: string) => {
    set({ loading: true });

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;

      set({ profile: data, loading: false });
    } catch (error) {
      console.error("Error fetching profile:", error);
      set({ loading: false });
    }
  },

  updateProfile: async (updates: Partial<Profile>) => {
    const { profile } = get();
    if (!profile) return { error: new Error("No profile loaded") };

    try {
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", profile.id);

      if (error) return { error };

      set({ profile: { ...profile, ...updates } });
      return { error: null };
    } catch (error) {
      return { error };
    }
  },

  clearProfile: () => {
    set({ profile: null });
  },
}));
