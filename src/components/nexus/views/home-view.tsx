'use client';

import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MessageSquare, Users, Phone, Settings, ShieldCheck, Sparkles, Zap } from 'lucide-react';

export function HomeView({ mobile = false }: { mobile?: boolean }) {
  const { profile } = useAuthStore();
  const { setActiveView, setMobileTab } = useUIStore();

  const go = (view: 'dms' | 'communities' | 'calls' | 'settings') => {
    if (mobile) {
      const tabMap = { dms: 'chats', communities: 'communities', calls: 'calls', settings: 'settings' } as const;
      setMobileTab(tabMap[view]);
    } else {
      setActiveView(view);
    }
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto p-6 lg:p-10 space-y-8">
        {/* Hero */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 ring-2 ring-primary/40">
              <AvatarFallback
                className="font-medium"
                style={{ backgroundColor: profile?.avatar_color || '#7c3aed', color: 'white' }}
              >
                {(profile?.display_name || profile?.username || 'U').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold">
                Welcome, <span className="nexus-violet-text">{profile?.display_name || profile?.username || 'Operator'}</span>
              </h1>
              <p className="text-sm text-muted-foreground">
                Your secure communications hub — end-to-end encrypted by default.
              </p>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction
            icon={<MessageSquare className="h-5 w-5" />}
            label="Messages"
            desc="Direct & group chats"
            onClick={() => go('dms')}
          />
          <QuickAction
            icon={<Users className="h-5 w-5" />}
            label="Communities"
            desc="Spaces & channels"
            onClick={() => go('communities')}
          />
          <QuickAction
            icon={<Phone className="h-5 w-5" />}
            label="Calls"
            desc="Voice & video"
            onClick={() => go('calls')}
          />
          <QuickAction
            icon={<Settings className="h-5 w-5" />}
            label="Settings"
            desc="Privacy & security"
            onClick={() => go('settings')}
          />
        </div>

        {/* Security status */}
        <Card className="nexus-glass p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-nexus-lavender" />
            <h2 className="text-lg font-semibold">Security Status</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <Stat icon={<ShieldCheck className="h-4 w-4" />} label="Encryption" value="Active" tone="good" />
            <Stat icon={<Sparkles className="h-4 w-4" />} label="Identity Key" value="Generated" tone="good" />
            <Stat icon={<Zap className="h-4 w-4" />} label="Realtime" value="Connected" tone="good" />
          </div>
          <p className="text-xs text-muted-foreground">
            Your DMs and private groups use X25519 key exchange with XChaCha20-Poly1305 authenticated encryption.
            Private keys never leave this device. Community channel messages are NOT end-to-end encrypted — they are
            subject to community moderation rules.
          </p>
        </Card>

        {/* Recent activity placeholder */}
        <Card className="nexus-glass p-6">
          <h2 className="text-lg font-semibold mb-3">Getting started</h2>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>Complete your profile in Settings → Profile</li>
            <li>Search for friends via the search bar (⌘K)</li>
            <li>Send a friend request and start an encrypted DM</li>
            <li>Create or join a community for group spaces</li>
            <li>Review your privacy settings</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, desc, onClick }: { icon: React.ReactNode; label: string; desc: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="h-auto p-4 flex flex-col items-start gap-2 nexus-glass hover:bg-accent/40 nexus-pressable"
    >
      <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center text-nexus-lavender">
        {icon}
      </div>
      <div className="text-left">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </Button>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-destructive';
  return (
    <div className="flex items-center gap-2">
      <div className="h-8 w-8 rounded-md bg-accent/40 flex items-center justify-center">{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-sm font-medium ${color}`}>{value}</div>
      </div>
    </div>
  );
}
