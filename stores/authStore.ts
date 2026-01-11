import { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
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
  signOut: () => Promise<void>;
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
      // Sign up user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) return { error };
      if (!data.user) return { error: new Error("No user returned") };

      // Create profile
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        username: username.toLowerCase(),
        full_name: username,
      });

      if (profileError) {
        console.error("Profile creation error:", profileError);
        return { error: profileError };
      }

      return { error: null };
    } catch (error) {
      return { error };
    }
  },

  signIn: async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      return { error };
    } catch (error) {
      return { error };
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },

  setSession: (session: Session | null) => {
    set({ session, user: session?.user ?? null });
  },
}));
