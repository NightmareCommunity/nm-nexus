'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  User, Shield, Bell, Palette, Smartphone, Lock, LogOut,
  ChevronLeft, Check, Upload, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: 'account', label: 'My Account', icon: User },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'privacy', label: 'Privacy', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'devices', label: 'Devices', icon: Smartphone },
  { id: 'security', label: 'Security', icon: Lock },
];

export function SettingsView({ mobile = false }: { mobile?: boolean }) {
  const { profile, settings, signOut, updateProfile, updateSettings } = useAuthStore();
  const { settingsSection, setSettingsSection } = useUIStore();
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [customStatus, setCustomStatus] = useState(profile?.custom_status || '');

  useEffect(() => {
    setDisplayName(profile?.display_name || '');
    setBio(profile?.bio || '');
    setCustomStatus(profile?.custom_status || '');
  }, [profile]);

  const saveProfile = async (patch: any) => {
    setSaving(true);
    const { error } = await updateProfile(patch);
    if (error) toast.error(error);
    else toast.success('Saved');
    setSaving(false);
  };

  const uploadAvatar = async (file: File) => {
    if (!profile) return;
    setUploadingAvatar(true);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop() || 'png';
      const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { cacheControl: '3600', upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);
      const { error } = await updateProfile({ avatar: publicUrl });
      if (error) throw error;
      toast.success('Avatar updated');
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message}`);
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <div className="flex-1 flex bg-[#0a0810]">
      {/* Settings nav */}
      <aside className={cn(
        'w-56 shrink-0 border-r border-white/5 bg-[#13101a] p-3',
        mobile && 'hidden'
      )}>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-2 mb-2">
          User Settings
        </h2>
        <nav className="space-y-0.5">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = settingsSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSettingsSection(s.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-white/80'
                )}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </nav>
        <div className="my-3 h-px bg-white/5" />
        <button
          onClick={async () => { await signOut(); toast.success('Signed out'); }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-destructive hover:bg-white/5"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </aside>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto">
        {mobile && (
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
            <select
              value={settingsSection}
              onChange={(e) => setSettingsSection(e.target.value)}
              className="bg-[#13101a] border border-white/10 rounded px-2 py-1 text-sm text-white"
            >
              {SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="max-w-2xl p-6 space-y-6">
          {settingsSection === 'account' && (
            <>
              <h1 className="text-xl font-bold text-white">My Account</h1>
              <div className="rounded-lg bg-[#13101a] border border-white/5 overflow-hidden">
                <div className="h-24 bg-gradient-to-br from-nexus-violet/30 to-nexus-lavender/10" />
                <div className="px-4 pb-4 -mt-10">
                  <Avatar className="h-20 w-20 ring-4 ring-[#13101a]">
                    {profile?.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <AvatarFallback className="text-xl" style={{ backgroundColor: profile?.avatar_color || '#7c3aed', color: 'white' }}>
                        {(profile?.display_name || profile?.username || 'U').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="mt-2">
                    <div className="font-semibold text-white">{profile?.display_name || profile?.username}</div>
                    <div className="text-sm text-muted-foreground">@{profile?.username}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Username</Label>
                  <Input value={profile?.username || ''} disabled className="bg-[#13101a] border-white/10" />
                  <p className="text-[10px] text-muted-foreground mt-1">Username cannot be changed at this time.</p>
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input value={profile ? '(private)' : ''} disabled className="bg-[#13101a] border-white/10" />
                </div>
              </div>
            </>
          )}

          {settingsSection === 'profile' && (
            <>
              <h1 className="text-xl font-bold text-white">Profile</h1>

              <div>
                <Label className="text-xs">Avatar</Label>
                <div className="flex items-center gap-3 mt-1">
                  <Avatar className="h-16 w-16">
                    {profile?.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <AvatarFallback className="text-xl" style={{ backgroundColor: profile?.avatar_color || '#7c3aed', color: 'white' }}>
                        {(profile?.display_name || profile?.username || 'U').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }}
                    />
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-sm">
                      {uploadingAvatar ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      Upload
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <Label className="text-xs">Display Name</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="bg-[#13101a] border-white/10 mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Bio (max 280)</Label>
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 280))}
                  rows={3}
                  className="bg-[#13101a] border-white/10 mt-1 resize-none"
                  placeholder="A few words about yourself"
                />
                <p className="text-[10px] text-muted-foreground mt-1">{bio.length}/280</p>
              </div>

              <div>
                <Label className="text-xs">Custom Status</Label>
                <Input
                  value={customStatus}
                  onChange={(e) => setCustomStatus(e.target.value.slice(0, 100))}
                  className="bg-[#13101a] border-white/10 mt-1"
                  placeholder="What are you up to?"
                />
              </div>

              <Button
                onClick={() => saveProfile({ display_name: displayName, bio, custom_status: customStatus })}
                disabled={saving}
                className="bg-nexus-violet hover:bg-nexus-violet/80 gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save changes
              </Button>
            </>
          )}

          {settingsSection === 'privacy' && settings && (
            <>
              <h1 className="text-xl font-bold text-white">Privacy</h1>
              <div className="space-y-3">
                <ToggleRow
                  label="Show my presence"
                  desc="Others can see when you're online."
                  checked={settings.presence_visible}
                  onChange={(v) => updateSettings({ presence_visible: v })}
                />
                <ToggleRow
                  label="Read receipts"
                  desc="Send a signal when you read messages."
                  checked={settings.read_receipts}
                  onChange={(v) => updateSettings({ read_receipts: v })}
                />
                <ToggleRow
                  label="Typing indicators"
                  desc="Show others when you're typing."
                  checked={settings.typing_indicators}
                  onChange={(v) => updateSettings({ typing_indicators: v })}
                />
              </div>
            </>
          )}

          {settingsSection === 'notifications' && settings && (
            <>
              <h1 className="text-xl font-bold text-white">Notifications</h1>
              <div className="space-y-3">
                <ToggleRow label="Direct messages" checked={settings.notif_messages} onChange={(v) => updateSettings({ notif_messages: v })} />
                <ToggleRow label="Mentions" checked={settings.notif_mentions} onChange={(v) => updateSettings({ notif_mentions: v })} />
                <ToggleRow label="Calls" checked={settings.notif_calls} onChange={(v) => updateSettings({ notif_calls: v })} />
                <ToggleRow label="Community activity" checked={settings.notif_community} onChange={(v) => updateSettings({ notif_community: v })} />
              </div>
            </>
          )}

          {settingsSection === 'appearance' && settings && (
            <>
              <h1 className="text-xl font-bold text-white">Appearance</h1>
              <div className="space-y-3">
                <ToggleRow
                  label="Reduced motion"
                  desc="Minimize animations and transitions."
                  checked={settings.reduced_motion}
                  onChange={(v) => updateSettings({ reduced_motion: v })}
                />
              </div>
            </>
          )}

          {settingsSection === 'devices' && (
            <>
              <h1 className="text-xl font-bold text-white">Devices</h1>
              <p className="text-sm text-muted-foreground">
                This device and others where you&apos;re signed in.
              </p>
              <div className="rounded-lg bg-[#13101a] border border-white/5 p-3">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-nexus-lavender" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">Current browser session</div>
                    <div className="text-xs text-muted-foreground">
                      {typeof navigator !== 'undefined' ? navigator.userAgent.split(') ')[0].split('(')[1] : 'Unknown device'}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {settingsSection === 'security' && (
            <>
              <h1 className="text-xl font-bold text-white">Security</h1>
              <p className="text-sm text-muted-foreground">
                End-to-end encryption keys and account security.
              </p>
              <div className="rounded-lg bg-[#13101a] border border-white/5 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-nexus-lavender" />
                  <span className="text-sm font-medium text-white">E2EE Identity Key</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your encryption keys are stored locally on this device. They never leave your device.
                  Messages are encrypted with X25519 + XChaCha20-Poly1305.
                </p>
                <p className="text-xs text-muted-foreground/70 font-mono">
                  {settings?.identity_key_public ? settings.identity_key_public.slice(0, 32) + '…' : 'Not yet generated'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-[#13101a] border border-white/5">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
