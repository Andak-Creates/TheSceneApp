import { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { detectAndSaveRegionCurrency } from "../lib/currency";
import { detectAndSaveUserLocation } from "../lib/location";
import { supabase } from "../lib/supabase";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  signUp: (
    email: string,
    password: string,
    username: string
  ) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    try {
      // Get initial session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      set({
        session,
        user: session?.user ?? null,
        loading: false,
        initialized: true,
      });

      // Listen for auth changes
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
        });
      });
    } catch (error) {
      console.error("Error initializing auth:", error);
      set({ loading: false, initialized: true });
    }
  },

  signUp: async (email: string, password: string, username: string) => {
    try {
      // Sign up user with metadata
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username.toLowerCase(),
            full_name: username,
          },
        },
      });

      if (error) return { error };
      if (!data.user) return { error: new Error("No user returned") };

      // Detect and save region currency and location
      await Promise.all([
        detectAndSaveRegionCurrency(data.user.id),
        detectAndSaveUserLocation(data.user.id),
      ]);

      return { error: null };
    } catch (error) {
      return { error };
    }
  },

  signIn: async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) return { error };
      if (data.user) {
        await Promise.all([
          detectAndSaveRegionCurrency(data.user.id),
          detectAndSaveUserLocation(data.user.id),
        ]);
      }

      return { error: null };
    } catch (error) {
      return { error };
    }
  },

  signOut: async () => {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Sign out error:", error);
        return { error };
      }

      // Clear state
      set({ session: null, user: null });
      return { error: null };
    } catch (error) {
      console.error("Sign out error:", error);
      return { error };
    }
  },

  setSession: (session: Session | null) => {
    set({ session, user: session?.user ?? null });
  },
}));
