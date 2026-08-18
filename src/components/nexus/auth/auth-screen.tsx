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

export function AuthScreen() {
  const { signInWithEmail, signUpWithEmail, loading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

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
              Encrypted messaging, calls, and communities — built for people who care.
            </p>
          </div>
          <div className="space-y-3">
            <Feature
              icon={<ShieldCheck className="h-5 w-5 text-nexus-lavender" />}
              title="End-to-end encrypted"
              desc="Your DMs and private groups stay between you and the people you talk to."
            />
            <Feature
              icon={<Sparkles className="h-5 w-5 text-nexus-gold" />}
              title="Premium feel"
              desc="Glass, gradients, smooth motion — never at the cost of performance."
            />
            <Feature
              icon={<Lock className="h-5 w-5 text-nexus-lavender" />}
              title="Real security"
              desc="X25519 + XChaCha20-Poly1305, audited primitives. No custom crypto."
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
                  End-to-end encryption keys are generated and stored on your device.
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
      <svg viewBox="0 0 512 512" className="relative h-full w-full">
        <defs>
          <linearGradient id="bm-g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c3aed"/>
            <stop offset="100%" stopColor="#07060c"/>
          </linearGradient>
          <linearGradient id="bm-g2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d4af37"/>
            <stop offset="100%" stopColor="#c4b5fd"/>
          </linearGradient>
        </defs>
        <rect width="512" height="512" rx="96" fill="url(#bm-g1)"/>
        <path
          d="M 152 372 L 152 140 L 196 140 L 316 296 L 316 140 L 360 140 L 360 372 L 316 372 L 196 216 L 196 372 Z"
          fill="url(#bm-g2)"
        />
      </svg>
    </div>
  );
}
