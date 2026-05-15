import { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { getFriendlyErrorMessage } from "../lib/error-utils";

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
    username: string,
    referredBy?: string
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

  signUp: async (email: string, password: string, username: string, referredBy?: string) => {
    try {
      const formattedUsername = username.toLowerCase().replace(/\s+/g, '-');

      // Check if username already exists to provide a friendly error message
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", formattedUsername)
        .maybeSingle();

      if (existingUser) {
        return { error: new Error("Username already in use. Please choose another one.") };
      }

      // Sign up user with metadata
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: "https://thesceneapp.online/email-confirmed",
          data: {
            username: formattedUsername,
            full_name: username.trim(),
            referred_by: referredBy || null,
          },
        },
      });

      if (error) return { error: { ...error, message: getFriendlyErrorMessage(error) } };
      if (!data.user) return { error: new Error("No user returned") };

      // NOTE: Do NOT write to user_preferences here.
      // The profiles row is created via a DB trigger that may not have
      // completed yet, causing FK violations. Preferences are set
      // during onboarding and updated from _layout after profile is confirmed.
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

      if (error) return { error: { ...error, message: getFriendlyErrorMessage(error) } };

      // NOTE: Do NOT overwrite user location/currency on every sign-in.
      // This would silently clobber preferences the user set during onboarding.
      // Currency is updated once from _layout after profile load.
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
