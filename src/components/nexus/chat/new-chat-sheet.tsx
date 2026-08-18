'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, Loader2, UserPlus, Lock } from 'lucide-react';
import { toast } from 'sonner';
import {
  generateDeviceKeyBundle,
  storeDeviceKeys,
  type DeviceKeyBundle,
} from '@/lib/crypto/e2ee';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function NewChatSheet({ onClose, onCreated }: Props) {
  const { user } = useAuthStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [provisioning, setProvisioning] = useState(false);

  const search = useCallback(async () => {
    if (!query || query.length < 2) { setResults([]); return; }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .neq('id', user!.id)
      .limit(20);
    if (error) toast.error(error.message);
    setResults(data || []);
    setLoading(false);
  }, [query, user]);

  useEffect(() => {
    const t = setTimeout(search, 250);
    return () => clearTimeout(t);
  }, [search]);

  const ensureDeviceKeys = async (): Promise<void> => {
    if (!user) return;
    // Check if device keys are already stored locally
    const existing = await loadLocalKeys(user.id);
    if (existing) return;
    setProvisioning(true);
    try {
      const bundle: DeviceKeyBundle = await generateDeviceKeyBundle(50);
      const supabase = createClient();
      // Register device in DB (public keys only — private never leaves device)
      const { error: devErr } = await supabase.from('devices').insert({
        user_id: user.id,
        identity_key_public: bundle.identity.publicKey,
        signed_prekey_public: bundle.signedPreKey.publicKey,
        signed_prekey_signature: bundle.signedPreKey.signature,
        name: navigator.userAgent.split(') ')[0]?.split('(')[1] || 'Web Device',
        platform: 'web',
      });
      if (devErr) throw devErr;
      // Upload one-time prekeys (public only) to user_settings
      const otpPublic = bundle.oneTimePreKeys.map(k => ({ keyId: k.keyId, key: k.publicKey }));
      await supabase.from('user_settings').update({
        identity_key_public: bundle.identity.publicKey,
        signed_prekey_public: bundle.signedPreKey.publicKey,
        signed_prekey_signature: bundle.signedPreKey.signature,
        one_time_prekeys: otpPublic,
      }).eq('user_id', user.id);
      // Store private keys locally
      storeDeviceKeys(user.id, {
        identity: bundle.identity,
        signedPreKey: bundle.signedPreKey,
        createdAt: bundle.createdAt,
      });
      toast.success('Encryption keys generated');
    } catch (e: any) {
      toast.error(`Key generation failed: ${e.message}`);
      throw e;
    } finally {
      setProvisioning(false);
    }
  };

  const createConversation = async () => {
    if (!user || !selected) return;
    setCreating(true);
    try {
      // 1. Ensure E2EE keys exist locally
      await ensureDeviceKeys();

      const supabase = createClient();
      // 2. Check if a DM already exists between these two users
      const { data: existingMemberships } = await supabase
        .from('conversation_members')
        .select('conversation_id, conversations!inner(type, is_encrypted)')
        .eq('user_id', selected.id);

      const existing = (existingMemberships || []).find(m => {
        // @ts-expect-error nested typing
        return m.conversations?.type === 'direct' && m.conversations?.is_encrypted;
      });

      let conversationId: string;
      if (existing) {
        conversationId = existing.conversation_id;
        // Add self as member if not already
        await supabase.from('conversation_members').upsert({
          conversation_id: conversationId,
          user_id: user.id,
          role: 'member',
        });
      } else {
        // 3. Create new encrypted DM
        const { data: conv, error: convErr } = await supabase.from('conversations').insert({
          type: 'direct',
          is_encrypted: true,
          created_by: user.id,
        }).select().single();
        if (convErr) throw convErr;
        conversationId = conv.id;
        // 4. Add both members
        const { error: mErr } = await supabase.from('conversation_members').insert([
          { conversation_id: conversationId, user_id: user.id, role: 'owner' },
          { conversation_id: conversationId, user_id: selected.id, role: 'member' },
        ]);
        if (mErr) throw mErr;
      }

      toast.success(`Started encrypted chat with @${selected.username}`);
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="nexus-glass-strong">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-nexus-lavender" />
            New encrypted conversation
          </DialogTitle>
          <DialogDescription>
            Search for a user to start an end-to-end encrypted DM. Messages will be encrypted on your device and only the recipient can decrypt them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search by username or display name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="max-h-72 overflow-y-auto scrollbar-thin space-y-1">
            {loading ? (
              <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : results.length === 0 && query.length >= 2 ? (
              <div className="text-sm text-muted-foreground text-center py-4">No users found</div>
            ) : (
              results.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className={`w-full flex items-center gap-3 p-2 rounded-md transition-colors text-left ${
                    selected?.id === p.id ? 'bg-primary/20 border border-primary/30' : 'hover:bg-accent/40 border border-transparent'
                  }`}
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback style={{ backgroundColor: p.avatar_color, color: 'white' }}>
                      {(p.display_name || p.username).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.display_name || p.username}</div>
                    <div className="text-xs text-muted-foreground">@{p.username}</div>
                  </div>
                  {p.status === 'online' && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                </button>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button onClick={createConversation} disabled={!selected || creating || provisioning}>
            {creating || provisioning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {provisioning ? 'Generating encryption keys…' : 'Creating…'}
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                Start chat
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helper — load local device keys (avoids circular import with crypto module)
async function loadLocalKeys(userId: string) {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('nm_nexus_keys_v1_' + userId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
