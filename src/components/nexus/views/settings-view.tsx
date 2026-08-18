'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  User, Lock, Bell, Palette, ShieldCheck, Smartphone, LogOut,
  Loader2, Check, Key, Fingerprint, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { loadDeviceKeys, clearDeviceKeys, generateDeviceKeyBundle, storeDeviceKeys } from '@/lib/crypto/e2ee';
import { createClient } from '@/lib/supabase/client';

type SettingsTab = 'profile' | 'privacy' | 'notifications' | 'appearance' | 'security' | 'devices';

export function SettingsView({ mobile = false }: { mobile?: boolean }) {
  const [tab, setTab] = useState<SettingsTab>('profile');
  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: <User className="h-4 w-4" /> },
    { id: 'privacy', label: 'Privacy', icon: <Lock className="h-4 w-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette className="h-4 w-4" /> },
    { id: 'security', label: 'Security', icon: <ShieldCheck className="h-4 w-4" /> },
    { id: 'devices', label: 'Devices', icon: <Smartphone className="h-4 w-4" /> },
  ];

  return (
    <div className="h-full flex flex-col">
      <header className="h-16 flex items-center px-4 border-b border-border">
        <h1 className="font-semibold">Settings</h1>
      </header>
      <div className="flex-1 flex overflow-hidden">
        {/* Tab list */}
        <nav className="w-16 sm:w-48 border-r border-border overflow-y-auto scrollbar-thin p-2 space-y-0.5 shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors ${
                tab === t.id ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:bg-accent/40'
              }`}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              <span className="shrink-0">{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>
        {/* Tab content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 sm:p-6">
          {tab === 'profile' && <ProfileTab />}
          {tab === 'privacy' && <PrivacyTab />}
          {tab === 'notifications' && <NotificationsTab />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'devices' && <DevicesTab />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { user, profile, updateProfile, signOut } = useAuthStore();
  const [username, setUsername] = useState(profile?.username || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [avatarColor, setAvatarColor] = useState(profile?.avatar_color || '#7c3aed');
  const [saving, setSaving] = useState(false);

  const colors = ['#7c3aed', '#5b21b6', '#d4af37', '#c4b5fd', '#10b981', '#f43f5e', '#3b82f6', '#f59e0b'];

  const save = async () => {
    setSaving(true);
    const { error } = await updateProfile({
      username, display_name: displayName, bio, avatar_color: avatarColor,
    });
    if (error) toast.error(error);
    else toast.success('Profile updated');
    setSaving(false);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Profile</h2>
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 ring-2 ring-primary/40">
            <AvatarFallback
              className="text-2xl font-medium"
              style={{ backgroundColor: avatarColor, color: 'white' }}
            >
              {(displayName || username || 'U').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <Label className="text-xs">Avatar color</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {colors.map(c => (
                <button
                  key={c}
                  onClick={() => setAvatarColor(c)}
                  className={`h-7 w-7 rounded-full ring-2 transition-all ${
                    avatarColor === c ? 'ring-foreground scale-110' : 'ring-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <Field label="Username">
        <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} maxLength={32} />
        <p className="text-xs text-muted-foreground">Letters, numbers, underscores. 3–32 chars.</p>
      </Field>

      <Field label="Display name">
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={64} />
      </Field>

      <Field label="Bio">
        <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3} />
        <p className="text-xs text-muted-foreground">{bio.length}/280</p>
      </Field>

      <Field label="Account email">
        <Input value={user?.email || ''} disabled className="bg-muted/30" />
        <p className="text-xs text-muted-foreground">Email changes are managed via Supabase Auth.</p>
      </Field>

      <div className="flex justify-between items-center pt-4 border-t border-border">
        <Button variant="destructive" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}

function PrivacyTab() {
  const { settings, updateSettings } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState({
    presence_visible: settings?.presence_visible ?? true,
    read_receipts: settings?.read_receipts ?? true,
    typing_indicators: settings?.typing_indicators ?? true,
    who_can_message: settings?.who_can_message ?? 'everyone',
    who_can_call: settings?.who_can_call ?? 'friends',
  });

  const save = async (patch: Partial<typeof s>) => {
    setSaving(true);
    const merged = { ...s, ...patch };
    setS(merged);
    await updateSettings(merged);
    setSaving(false);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold">Privacy</h2>

      <ToggleRow
        label="Show online status"
        desc="When off, others can't see when you're online."
        checked={s.presence_visible}
        onCheckedChange={(v) => save({ presence_visible: v })}
      />
      <ToggleRow
        label="Send read receipts"
        desc="When off, others won't know when you've read their messages."
        checked={s.read_receipts}
        onCheckedChange={(v) => save({ read_receipts: v })}
      />
      <ToggleRow
        label="Send typing indicators"
        desc="When off, others won't see when you're typing."
        checked={s.typing_indicators}
        onCheckedChange={(v) => save({ typing_indicators: v })}
      />

      <Field label="Who can message me">
        <select
          value={s.who_can_message}
          onChange={(e) => save({ who_can_message: e.target.value as any })}
          className="w-full bg-input/50 rounded-md px-3 py-2 text-sm border border-border"
        >
          <option value="everyone">Everyone</option>
          <option value="friends">Friends only</option>
          <option value="nobody">Nobody</option>
        </select>
      </Field>

      <Field label="Who can call me">
        <select
          value={s.who_can_call}
          onChange={(e) => save({ who_can_call: e.target.value as any })}
          className="w-full bg-input/50 rounded-md px-3 py-2 text-sm border border-border"
        >
          <option value="everyone">Everyone</option>
          <option value="friends">Friends only</option>
          <option value="nobody">Nobody</option>
        </select>
      </Field>

      {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
    </div>
  );
}

function NotificationsTab() {
  const { settings, updateSettings } = useAuthStore();
  const [s, setS] = useState({
    notif_messages: settings?.notif_messages ?? true,
    notif_mentions: settings?.notif_mentions ?? true,
    notif_calls: settings?.notif_calls ?? true,
    notif_community: settings?.notif_community ?? true,
  });

  const save = async (patch: Partial<typeof s>) => {
    const merged = { ...s, ...patch };
    setS(merged);
    await updateSettings(merged);
    toast.success('Notification preference updated');
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold">Notifications</h2>
      <ToggleRow label="Messages" desc="Direct messages and group chats" checked={s.notif_messages} onCheckedChange={(v) => save({ notif_messages: v })} />
      <ToggleRow label="Mentions" desc="When someone @mentions you" checked={s.notif_mentions} onCheckedChange={(v) => save({ notif_mentions: v })} />
      <ToggleRow label="Calls" desc="Incoming voice and video calls" checked={s.notif_calls} onCheckedChange={(v) => save({ notif_calls: v })} />
      <ToggleRow label="Community activity" desc="Community invitations and channel activity" checked={s.notif_community} onCheckedChange={(v) => save({ notif_community: v })} />
    </div>
  );
}

function AppearanceTab() {
  const { settings, updateSettings } = useAuthStore();
  const [accent, setAccent] = useState(settings?.accent_color || '#a855f7');
  const [reducedMotion, setReducedMotion] = useState(settings?.reduced_motion ?? false);

  const accents = ['#a855f7', '#7c3aed', '#5b21b6', '#d4af37', '#10b981', '#f43f5e'];

  const save = async (patch: any) => {
    await updateSettings(patch);
    toast.success('Appearance updated');
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold">Appearance</h2>
      <Field label="Accent color">
        <div className="flex gap-2">
          {accents.map(c => (
            <button
              key={c}
              onClick={() => { setAccent(c); save({ accent_color: c }); }}
              className={`h-8 w-8 rounded-full ring-2 transition-all ${
                accent === c ? 'ring-foreground scale-110' : 'ring-transparent'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </Field>
      <ToggleRow
        label="Reduced motion"
        desc="Minimize animations and transitions"
        checked={reducedMotion}
        onCheckedChange={(v) => { setReducedMotion(v); save({ reduced_motion: v }); }}
      />
      <p className="text-xs text-muted-foreground">
        NM NEXUS uses a premium dark theme by default. A light theme is not yet available.
      </p>
    </div>
  );
}

function SecurityTab() {
  const { user } = useAuthStore();
  const [provisioning, setProvisioning] = useState(false);
  const [hasKeys, setHasKeys] = useState(false);

  const checkKeys = async () => {
    if (!user) return;
    const k = loadDeviceKeys(user.id);
    setHasKeys(!!k);
  };
  useState(() => { checkKeys(); });

  const regenerate = async () => {
    if (!user) return;
    if (!confirm('Regenerate encryption keys? This will invalidate your ability to decrypt old messages on this device. Make sure you have a backup.')) return;
    setProvisioning(true);
    try {
      clearDeviceKeys(user.id);
      const bundle = await generateDeviceKeyBundle(50);
      const supabase = createClient();
      await supabase.from('devices').insert({
        user_id: user.id,
        identity_key_public: bundle.identity.publicKey,
        signed_prekey_public: bundle.signedPreKey.publicKey,
        signed_prekey_signature: bundle.signedPreKey.signature,
        name: navigator.userAgent.split(') ')[0]?.split('(')[1] || 'Web Device',
        platform: 'web',
      });
      await supabase.from('user_settings').update({
        identity_key_public: bundle.identity.publicKey,
        signed_prekey_public: bundle.signedPreKey.publicKey,
        signed_prekey_signature: bundle.signedPreKey.signature,
        one_time_prekeys: bundle.oneTimePreKeys.map(k => ({ keyId: k.keyId, key: k.publicKey })),
      }).eq('user_id', user.id);
      storeDeviceKeys(user.id, {
        identity: bundle.identity,
        signedPreKey: bundle.signedPreKey,
        createdAt: bundle.createdAt,
      });
      setHasKeys(true);
      toast.success('Encryption keys regenerated');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-nexus-lavender" />
        Security & Encryption
      </h2>

      <Card className="nexus-glass p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${hasKeys ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
            {hasKeys ? <Check className="h-5 w-5 text-emerald-400" /> : <AlertTriangle className="h-5 w-5 text-amber-400" />}
          </div>
          <div>
            <div className="font-medium text-sm">
              {hasKeys ? 'Device keys active' : 'No device keys'}
            </div>
            <div className="text-xs text-muted-foreground">
              {hasKeys
                ? 'Your identity key is stored locally and registered with the server.'
                : 'Generate keys to enable end-to-end encryption on this device.'}
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={regenerate} disabled={provisioning}>
          {provisioning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Key className="h-4 w-4 mr-2" />}
          {hasKeys ? 'Regenerate keys' : 'Generate keys'}
        </Button>
      </Card>

      <Card className="nexus-glass p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-nexus-lavender" />
          <h3 className="font-medium text-sm">How encryption works</h3>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
          <li>Your identity key is an X25519 keypair generated in your browser via libsodium.</li>
          <li>The <strong>private</strong> key never leaves this device. It is stored in localStorage.</li>
          <li>The <strong>public</strong> key is registered with the server so others can encrypt messages to you.</li>
          <li>Each DM uses X25519 ECDH + XChaCha20-Poly1305 authenticated encryption.</li>
          <li>Group chats use a shared symmetric key wrapped per-recipient.</li>
          <li>Losing your private key means losing access to old encrypted messages — back up safely.</li>
        </ul>
      </Card>

      <Card className="nexus-glass p-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <h3 className="font-medium text-sm">Recovery limitations</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          NM NEXUS does NOT have a centralized key escrow. If you lose your device or clear browser data
          without backing up your identity key, you will not be able to decrypt old messages. Future
          versions will support an optional encrypted backup stored on the server (encrypted with a
          user-chosen recovery passphrase).
        </p>
      </Card>

      <Card className="nexus-glass p-5">
        <h3 className="font-medium text-sm mb-2">Threat model</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          We protect against a honest-but-curious server: Supabase cannot read your DM plaintext.
          We do NOT protect against a compromised endpoint (malware on your device) or a coerced
          key disclosure. See <code className="text-[10px] px-1 py-0.5 rounded bg-muted/50">docs/security/e2ee.md</code> for details.
        </p>
      </Card>
    </div>
  );
}

function DevicesTab() {
  const { user } = useAuthStore();
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useState(() => {
    if (!user) return;
    const supabase = createClient();
    supabase.from('devices').select('*').eq('user_id', user.id).order('last_active', { ascending: false })
      .then(({ data }) => {
        setDevices(data || []);
        setLoading(false);
      });
  });

  const revoke = async (id: string) => {
    if (!user) return;
    if (!confirm('Revoke this device? You will need to re-authenticate on it.')) return;
    const supabase = createClient();
    await supabase.from('devices').delete().eq('id', id).eq('user_id', user.id);
    setDevices(prev => prev.filter(d => d.id !== id));
    toast.success('Device revoked');
  };

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-lg font-semibold">Devices</h2>
      <p className="text-sm text-muted-foreground">
        Each device you log into gets its own encryption key pair. Revoke devices you no longer use.
      </p>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading devices…</div>
      ) : devices.length === 0 ? (
        <Card className="nexus-glass p-5 text-center text-sm text-muted-foreground">
          No devices registered. Generate keys in Security to register this device.
        </Card>
      ) : (
        <div className="space-y-2">
          {devices.map(d => (
            <Card key={d.id} className="nexus-glass p-4 flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{d.name || 'Unknown device'}</div>
                <div className="text-xs text-muted-foreground">
                  {d.platform || 'unknown'} · last active {new Date(d.last_active).toLocaleString()}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                  {d.identity_key_public?.slice(0, 32)}…
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => revoke(d.id)}>Revoke</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared components ──────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, checked, onCheckedChange }: {
  label: string; desc: string; checked: boolean; onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/40">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
