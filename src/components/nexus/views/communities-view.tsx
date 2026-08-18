'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Users, Plus, Hash, Volume2, Lock, Globe, ArrowLeft, MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import { useUIStore } from '@/lib/stores/ui-store';
import { cn } from '@/lib/utils';

type Community = Database['public']['Tables']['communities']['Row'];
type Channel = Database['public']['Tables']['channels']['Row'];

export function CommunitiesView({ mobile = false }: { mobile?: boolean }) {
  const { user } = useAuthStore();
  const { setActiveChannel, setMobileTab } = useUIStore();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selected, setSelected] = useState<Community | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data: memberships } = await supabase
      .from('community_members')
      .select('community_id, communities!inner(*)')
      .eq('user_id', user.id);
    const list = (memberships || []).map((m: any) => m.communities as Community);
    setCommunities(list);
    setLoading(false);
  }, [user]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const openCommunity = async (c: Community) => {
    setSelected(c);
    const supabase = createClient();
    const { data: ch } = await supabase.from('channels').select('*').eq('community_id', c.id).order('position');
    setChannels(ch || []);
  };

  const openChannel = (ch: Channel) => {
    setActiveChannel(ch.id);
    if (mobile) setMobileTab('chats');
  };

  if (selected) {
    return (
      <div className="h-full flex flex-col">
        <header className="h-16 flex items-center gap-3 px-4 border-b border-border">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setSelected(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-9 w-9 ring-1 ring-border">
            <AvatarFallback style={{ backgroundColor: '#7c3aed', color: 'white' }}>
              {selected.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{selected.name}</div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              {selected.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {selected.is_public ? 'Public' : 'Private'} · @{selected.slug}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground px-2 py-1">Text Channels</div>
          {channels.filter(c => c.type === 'text' || c.type === 'announcement').map(ch => (
            <button
              key={ch.id}
              onClick={() => openChannel(ch)}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent/40 transition-colors text-sm text-left"
            >
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">{ch.name}</span>
              {ch.topic && <span className="text-[10px] text-muted-foreground truncate">{ch.topic}</span>}
            </button>
          ))}
          <div className="text-xs uppercase tracking-wider text-muted-foreground px-2 py-1 mt-3">Voice Channels</div>
          {channels.filter(c => c.type === 'voice').map(ch => (
            <button
              key={ch.id}
              onClick={() => openChannel(ch)}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent/40 transition-colors text-sm text-left"
            >
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">{ch.name}</span>
            </button>
          ))}
          {channels.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No channels yet. The owner can create channels.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="h-16 flex items-center justify-between px-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-nexus-lavender" />
          <h1 className="font-semibold">Communities</h1>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
        {loading ? (
          <div className="text-sm text-muted-foreground p-4">Loading…</div>
        ) : communities.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <div>
              <div className="font-medium">No communities yet</div>
              <div className="text-sm text-muted-foreground">Create one or join via invite code.</div>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Create</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {communities.map(c => (
              <button
                key={c.id}
                onClick={() => openCommunity(c)}
                className="w-full flex items-center gap-3 p-3 rounded-lg nexus-glass hover:bg-accent/40 transition-colors text-left"
              >
                <Avatar className="h-11 w-11 ring-1 ring-border">
                  <AvatarFallback style={{ backgroundColor: '#7c3aed', color: 'white' }}>
                    {c.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate flex items-center gap-1.5">
                    {c.name}
                    {c.is_public ? <Globe className="h-3 w-3 text-muted-foreground" /> : <Lock className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{c.description || `@${c.slug}`}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {createOpen && <CreateCommunitySheet onClose={() => setCreateOpen(false)} onCreated={load} />}
    </div>
  );
}

function CreateCommunitySheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { user } = useAuthStore();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!user) return;
    if (!name || !slug) { toast.error('Name and slug required'); return; }
    setCreating(true);
    try {
      const supabase = createClient();
      const { data: com, error } = await supabase.from('communities').insert({
        owner_id: user.id,
        name, slug, description,
        is_public: isPublic,
      }).select().single();
      if (error) throw error;
      // Owner becomes a member with role owner
      await supabase.from('community_members').insert({
        community_id: com.id, user_id: user.id, role: 'owner',
      });
      // Create default channels
      await supabase.from('channels').insert([
        { community_id: com.id, name: 'general', type: 'text', position: 0 },
        { community_id: com.id, name: 'announcements', type: 'announcement', position: 1 },
        { community_id: com.id, name: 'General Voice', type: 'voice', position: 2 },
      ]);
      toast.success(`Community "${name}" created`);
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="nexus-glass-strong">
        <DialogHeader>
          <DialogTitle>Create a community</DialogTitle>
          <DialogDescription>Communities contain text and voice channels. Community channel messages are NOT end-to-end encrypted.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => {
              setName(e.target.value);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'));
            }} placeholder="Nightmare Studios" maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="nightmare-studios" />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A place for builders" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            Public (discoverable)
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={create} disabled={creating}>{creating ? 'Creating…' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
