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
  initError: string | null;
  error: string | null;

  init: () => Promise<void>;
  retryInit: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string, username?: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<{ error: string | null }>;
  updateSettings: (patch: Partial<Settings>) => Promise<{ error: string | null }>;
  clearError: () => void;
}

const INIT_TIMEOUT_MS = 8000;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  settings: null,
  loading: false,
  initialized: false,
  initError: null,
  error: null,

  init: async () => {
    if (get().initialized) return;
    set({ initError: null });

    const supabase = createClient();

    // Race getSession against a timeout — NEVER hang the UI forever.
    let timedOut = false;
    const timeout = new Promise<{ timedOut: true }>((resolve) =>
      setTimeout(() => { timedOut = true; resolve({ timedOut: true }); }, INIT_TIMEOUT_MS)
    );

    try {
      const result = await Promise.race([
        supabase.auth.getSession(),
        timeout,
      ]);

      if ('timedOut' in result && result.timedOut) {
        set({
          initialized: true,
          initError: 'Took too long to reach the auth service. Check your connection and retry.',
        });
        return;
      }

      const { data, error } = result as Awaited<ReturnType<typeof supabase.auth.getSession>>;
      if (error) {
        set({
          initialized: true,
          initError: `Auth error: ${error.message}`,
        });
        return;
      }

      const user = data.session?.user ?? null;
      set({ user });

      if (user) {
        // Fetch profile with a timeout too — don't block init on profile failure.
        await Promise.race([
          get().refreshProfile(),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      }

      set({ initialized: true, initError: null });

      // Listen for subsequent auth changes.
      supabase.auth.onAuthStateChange(async (_event, session) => {
        const u = session?.user ?? null;
        set({ user: u });
        if (u) {
          get().refreshProfile();
        } else {
          set({ profile: null, settings: null });
        }
      });
    } catch (e: any) {
      set({
        initialized: true,
        initError: e?.message || 'Unexpected error during initialization.',
      });
    }
  },

  retryInit: async () => {
    set({ initialized: false, initError: null });
    await get().init();
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
    // The handle_new_user trigger creates a profile row automatically.
    // If the user provided a username, update it on the auto-created profile.
    if (data.user && username) {
      try {
        await supabase
          .from('profiles')
          .update({ username, display_name: username })
          .eq('id', data.user.id);
      } catch {
        // non-fatal — trigger created a default profile
      }
    }
    set({ loading: false });
    return { error: null };
  },

  signInWithGoogle: async () => {
    set({ loading: true, error: null });
    const supabase = createClient();
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback`
        : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) {
      set({ loading: false, error: error.message });
      return { error: error.message };
    }
    return { error: null };
  },

  signOut: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ user: null, profile: null, settings: null, initialized: true });
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    const supabase = createClient();
    try {
      const [{ data: profile, error: pErr }, { data: settings, error: sErr }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      if (pErr || sErr) {
        console.warn('profile load error', pErr, sErr);
      }

      // If profile row is missing (e.g. trigger didn't fire for legacy users),
      // try to create one client-side. RLS allows self-insert.
      if (!profile) {
        const fallbackUsername =
          user.user_metadata?.username ||
          user.email?.split('@')[0] ||
          `user_${user.id.slice(0, 8)}`;
        const { data: newProfile, error: insErr } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            username: fallbackUsername,
            display_name: fallbackUsername,
            status: 'online',
          })
          .select()
          .maybeSingle();
        if (!insErr && newProfile) {
          set({ profile: newProfile });
        }
      } else {
        set({ profile });
      }

      if (!settings) {
        const { data: newSettings, error: insErr } = await supabase
          .from('user_settings')
          .insert({ user_id: user.id })
          .select()
          .maybeSingle();
        if (!insErr && newSettings) {
          set({ settings: newSettings });
        }
      } else {
        set({ settings });
      }

      // Update presence
      supabase
        .from('profiles')
        .update({ status: 'online', last_seen: new Date().toISOString() })
        .eq('id', user.id)
        .then(() => {});
    } catch (e) {
      console.warn('refreshProfile failed', e);
    }
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
