# Google OAuth Setup — NM NEXUS

This guide covers the one-time setup required to enable Google Sign-In.

## 1. Google Cloud Console

1. Go to **Google Cloud Console** → APIs & Services → Credentials:
   https://console.cloud.google.com/apis/credentials

2. Open the OAuth 2.0 Client ID you created:
   - **Client ID**: `776679789908-seuootjv4s3daj6j104p56mvsj5ocdti.apps.googleusercontent.com`

3. Under **Authorized JavaScript origins**, add:
   ```
   https://nm-nexus.ojaskhanna432.workers.dev
   https://juzmgejicviennjcykxq.supabase.co
   http://localhost:3000
   ```

4. Under **Authorized redirect URIs**, add:
   ```
   https://juzmgejicviennjcykxq.supabase.co/auth/v1/callback
   https://nm-nexus.ojaskhanna432.workers.dev/auth/callback
   http://localhost:3000/auth/callback
   ```

   > The Supabase callback URL (`https://<project>.supabase.co/auth/v1/callback`) is **required** —
   > Google redirects there after sign-in, then Supabase exchanges the code and redirects
   > to our `/auth/callback` route which establishes the session cookie.

5. Click **Save**.

## 2. Supabase Dashboard

1. Go to your Supabase project:
   https://supabase.com/dashboard/project/juzmgejicviennjcykxq

2. **Authentication** → **Providers** → **Google** → toggle **Enable**.

3. Paste the credentials (use the real values from your Google Cloud Console — do NOT commit them):
   - **Client ID**: `776679789908-seuootjv4s3daj6j104p56mvsj5ocdti.apps.googleusercontent.com`
   - **Client Secret**: *(set in Supabase Dashboard directly — never written to source)*

4. **Save**. Supabase will show the canonical redirect URI to add to Google (already added above).

## 3. Cloudflare Worker Secrets (already configured)

The following secrets are stored encrypted in the Cloudflare Worker:

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXT_PUBLIC_GOOGLE_CLIENT_ID
```

To rotate or update them:
```bash
npx wrangler secret put GOOGLE_CLIENT_ID --name nm-nexus
npx wrangler secret put GOOGLE_CLIENT_SECRET --name nm-nexus
npx wrangler secret put NEXT_PUBLIC_GOOGLE_CLIENT_ID --name nm-nexus
```

## 4. How it works (flow)

1. User clicks **Continue with Google** on the auth screen.
2. App calls `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: '/auth/callback' })`.
3. Supabase returns a Google OAuth URL → browser navigates to it.
4. User signs in with Google.
5. Google redirects to `https://juzmgejicviennjcykxq.supabase.co/auth/v1/callback`.
6. Supabase exchanges the Google code for a session, then redirects to our `redirectTo`.
7. Our `/auth/callback` route calls `supabase.auth.exchangeCodeForSession(code)` to set the
   cookie, then redirects to `/`.
8. The app shell detects the session and shows the main UI.

## 5. Local development

For local dev, add to `.env.local` (replace with your real credentials from Google Cloud Console):
```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

And add `http://localhost:3000/auth/callback` to Google's authorized redirect URIs.
