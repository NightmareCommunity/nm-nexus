'use client';

import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Settings = Database['public']['Tables']['user_settings']['Row'];

interface AuthState {
  user: User | null;
  profile: Profile | null;
  settings: Settings | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;

  init: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string, username?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<{ error: string | null }>;
  updateSettings: (patch: Partial<Settings>) => Promise<{ error: string | null }>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  settings: null,
  loading: false,
  initialized: false,
  error: null,

  init: async () => {
    if (get().initialized) return;
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      set({ user: session.user });
      await get().refreshProfile();
    }
    set({ initialized: true });

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;
      set({ user });
      if (user) {
        await get().refreshProfile();
      } else {
        set({ profile: null, settings: null });
      }
    });
  },

  signInWithEmail: async (email, password) => {
    set({ loading: true, error: null });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false, error: error.message });
      return { error: error.message };
    }
    set({ loading: false });
    return { error: null };
  },

  signUpWithEmail: async (email, password, username) => {
    set({ loading: true, error: null });
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (error) {
      set({ loading: false, error: error.message });
      return { error: error.message };
    }
    // If username provided, update the auto-generated profile
    if (data.user && username) {
      try {
        await supabase
          .from('profiles')
          .update({ username, display_name: username })
          .eq('id', data.user.id);
      } catch {
        // non-fatal — trigger will have created a default profile
      }
    }
    set({ loading: false });
    return { error: null };
  },

  signOut: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ user: null, profile: null, settings: null });
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    const supabase = createClient();
    const [{ data: profile, error: pErr }, { data: settings, error: sErr }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    if (pErr || sErr) {
      console.error('profile load error', pErr, sErr);
    }
    set({ profile, settings });
  },

  updateProfile: async (patch) => {
    const { user } = get();
    if (!user) return { error: 'no user' };
    const supabase = createClient();
    const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
    if (error) return { error: error.message };
    await get().refreshProfile();
    return { error: null };
  },

  updateSettings: async (patch) => {
    const { user } = get();
    if (!user) return { error: 'no user' };
    const supabase = createClient();
    const { error } = await supabase.from('user_settings').update(patch).eq('user_id', user.id);
    if (error) return { error: error.message };
    await get().refreshProfile();
    return { error: null };
  },

  clearError: () => set({ error: null }),
}));
