'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Mail, User, Loader2, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function AuthScreen() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, loading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setGoogleLoading(false);
      toast.error(error);
    }
    // On success the browser will redirect to Google → Supabase → /auth/callback.
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') {
      const { error } = await signInWithEmail(email, password);
      if (error) toast.error(error);
      else toast.success('Welcome back to NM NEXUS');
    } else {
      if (password.length < 8) {
        toast.error('Password must be at least 8 characters');
        return;
      }
      const { error } = await signUpWithEmail(email, password, username || undefined);
      if (error) toast.error(error);
      else toast.success('Account created. Check your email to verify (if required).');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-6 lg:gap-10 items-center">
        {/* Left — brand showcase */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="hidden lg:flex flex-col gap-6"
        >
          <BrandMark size="lg" />
          <div className="space-y-3">
            <h1 className="text-5xl font-bold tracking-tight">
              <span className="nexus-violet-text">NM NEXUS</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              Realtime messaging, calls, and communities — built for people who care.
            </p>
          </div>
          <div className="space-y-3">
            <Feature
              icon={<ShieldCheck className="h-5 w-5 text-nexus-lavender" />}
              title="Realtime messaging"
              desc="DMs, group chats, communities, and channels — all synced live across your devices."
            />
            <Feature
              icon={<Sparkles className="h-5 w-5 text-nexus-gold" />}
              title="Premium feel"
              desc="Glass, gradients, smooth motion — never at the cost of performance."
            />
            <Feature
              icon={<Lock className="h-5 w-5 text-nexus-lavender" />}
              title="Secured by Supabase"
              desc="Row-level security on every table. Your data is isolated to your account."
            />
          </div>
        </motion.div>

        {/* Right — auth card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="nexus-glass-strong rounded-2xl p-6 sm:p-8 shadow-2xl"
        >
          <div className="lg:hidden mb-6 flex items-center gap-3">
            <BrandMark size="sm" />
            <div>
              <div className="text-xl font-bold nexus-violet-text">NM NEXUS</div>
              <div className="text-xs text-muted-foreground">by NIGHTMARE STUDIOS</div>
            </div>
          </div>

          <Tabs value={mode} onValueChange={(v) => { setMode(v as 'signin' | 'signup'); clearError(); }}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            {/* Google OAuth — shared across both modes */}
            <div className="mb-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogle}
                disabled={googleLoading || loading}
                className="w-full bg-background/50 hover:bg-accent/10 border-border/60 nexus-pressable"
              >
                {googleLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <GoogleIcon className="mr-2" />
                )}
                Continue with Google
              </Button>
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/40" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wider">
                <span className="bg-transparent px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <TabsContent value="signin">
              <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Email" icon={<Mail className="h-4 w-4" />}>
                  <Input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@nexus.studio"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-input/50"
                  />
                </Field>
                <Field label="Password" icon={<Lock className="h-4 w-4" />}>
                  <Input
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-input/50"
                  />
                </Field>
                <SubmitButton loading={loading} label="Sign in" />
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Username (optional)" icon={<User className="h-4 w-4" />}>
                  <Input
                    type="text"
                    autoComplete="username"
                    placeholder="nightmare"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="bg-input/50"
                    minLength={3}
                    maxLength={32}
                  />
                </Field>
                <Field label="Email" icon={<Mail className="h-4 w-4" />}>
                  <Input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@nexus.studio"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-input/50"
                  />
                </Field>
                <Field label="Password (min 8 chars)" icon={<Lock className="h-4 w-4" />}>
                  <Input
                    type="password"
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-input/50"
                    minLength={8}
                  />
                </Field>
                <SubmitButton loading={loading} label="Create account" />
                <p className="text-xs text-muted-foreground text-center">
                  By creating an account you agree to keep your credentials safe.
                  Your data is protected by Supabase row-level security.
                </p>
              </form>
            </TabsContent>
          </Tabs>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-6 pt-4 border-t border-border/50 text-xs text-muted-foreground text-center">
            NIGHTMARE STUDIOS · NM NEXUS · v1.0
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      {children}
    </div>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <Button
      type="submit"
      disabled={loading}
      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground nexus-pressable"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <ArrowRight className="h-4 w-4 mr-2" />
      )}
      {label}
    </Button>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="mt-0.5 shrink-0 h-9 w-9 rounded-lg bg-accent/30 flex items-center justify-center border border-accent/40">
        {icon}
      </div>
      <div>
        <div className="font-medium text-sm">{title}</div>
        <div className="text-sm text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}

export function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'h-10 w-10' : size === 'lg' ? 'h-20 w-20' : 'h-14 w-14';
  return (
    <div className={`${dims} relative shrink-0`}>
      <div className="absolute inset-0 rounded-xl nexus-glow-violet" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="NM NEXUS"
        className="relative h-full w-full rounded-xl object-cover"
      />
    </div>
  );
}
