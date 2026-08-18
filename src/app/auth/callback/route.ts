import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * OAuth callback handler.
 *
 * After Google (or any OAuth provider) redirects back to Supabase,
 * Supabase forwards here with a `code` query param. We exchange the
 * code for a session, then redirect the user to the app root.
 *
 * Required redirect URI configuration in Google Cloud Console:
 *   https://juzmgejicviennjcykxq.supabase.co/auth/v1/callback
 *
 * The `redirectTo` option we pass to `signInWithOAuth` points here:
 *   https://nm-nexus.ojaskhanna432.workers.dev/auth/callback
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('OAuth code exchange failed:', error.message);
      // Redirect to home with error indicator — the auth screen will surface it.
      return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error.message)}`);
    }
  }

  // Successful exchange — send the user into the app.
  return NextResponse.redirect(`${origin}/`);
}
