'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

/**
 * Browser-side Supabase client.
 * Uses cookies for session persistence — anon key only, RLS enforces all access.
 *
 * If env vars are missing (e.g. misconfigured deploy), createClient() will throw.
 * Callers should catch and surface a friendly error.
 */
let cachedClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  cachedClient = createBrowserClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Don't lock the browser tab on auth calls — keep things snappy
      flowType: 'pkce',
    },
    realtime: {
      params: { eventsPerSecond: 5 },
    },
    global: {
      // Sane fetch timeout via AbortController (Supabase v2 supports this)
      fetch: (input: any, init?: any) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        return fetch(input, { ...init, signal: controller.signal }).finally(() =>
          clearTimeout(timeoutId)
        );
      },
    },
  });

  return cachedClient;
}
