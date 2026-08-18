'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Compass, Users, LogOut, Copy, Hash, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createCommunity as createCommunityRpc,
  joinCommunityByInvite,
  leaveCommunity as leaveCommunityRpc,
} from '@/lib/nexus-helpers';

type Community = Database['public']['Tables']['communities']['Row'];

export function CommunitiesView({ mobile = false }: { mobile?: boolean }) {
  const { user } = useAuthStore();
  const { setActiveChannel, setActiveCommunity, setActiveView } = useUIStore();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from('community_members')
      .select('community_id, communities!inner(*)')
      .eq('user_id', user.id);
    if (error) {
      console.error('load communities failed', error);
      return;
    }
    setCommunities((data || []).map((d: any) => d.communities as Community));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh on any community membership change for this user
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`communities-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_members', filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'communities' },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    const id = await createCommunityRpc({
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      isPublic: true,
    });
    setLoading(false);
    if (id) {
      setCreateOpen(false);
      setNewName('');
      setNewDesc('');
      await load();
      setActiveCommunity(id);
      setActiveView('communities');
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setLoading(true);
    const id = await joinCommunityByInvite(joinCode.trim());
    setLoading(false);
    if (id) {
      setJoinOpen(false);
      setJoinCode('');
      await load();
      setActiveCommunity(id);
      setActiveView('communities');
    }
  };

  const handleLeave = async (id: string) => {
    if (!confirm('Leave this community? You will need a new invite to rejoin.')) return;
    const ok = await leaveCommunityRpc(id);
    if (ok) load();
  };

  const openCommunity = (c: Community) => {
    setActiveCommunity(c.id);
    setActiveChannel(null, c.id);
    setActiveView('communities');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0810]">
      <div className="px-6 pt-6 pb-4 border-b border-white/5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Communities</h1>
          <p className="text-sm text-muted-foreground">Your communities and servers.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setJoinOpen(true)}>
            <Compass className="h-4 w-4" /> Join
          </Button>
          <Button className="gap-2 bg-nexus-violet hover:bg-nexus-violet/80" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create
          </Button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {communities.length === 0 ? (
          <div className="col-span-full text-center py-16">
            <div className="h-16 w-16 rounded-full bg-nexus-violet/20 flex items-center justify-center mx-auto mb-3">
              <Users className="h-7 w-7 text-nexus-lavender" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">No communities yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your own or join one with an invite code.
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" className="gap-2" onClick={() => setJoinOpen(true)}>
                <Compass className="h-4 w-4" /> Join Community
              </Button>
              <Button className="gap-2 bg-nexus-violet hover:bg-nexus-violet/80" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create Community
              </Button>
            </div>
          </div>
        ) : (
          communities.map((c) => (
            <div key={c.id} className="rounded-xl bg-[#13101a] border border-white/5 overflow-hidden hover:border-nexus-violet/30 transition-colors">
              <div className="h-20 bg-gradient-to-br from-nexus-violet/30 to-nexus-lavender/10 relative flex items-center justify-center">
                {c.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.icon} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
                ) : (
                  <span className="text-3xl font-bold text-white/80">{c.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-bold text-white flex items-center gap-2">
                  {c.name}
                  {c.is_verified && <span className="text-xs text-nexus-gold">✓</span>}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{c.description || 'No description'}</p>
                <div className="mt-2 text-xs text-muted-foreground flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> {c.member_count || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Hash className="h-3 w-3" /> channels
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" onClick={() => openCommunity(c)} className="gap-1 bg-nexus-violet hover:bg-nexus-violet/80">
                    Open
                  </Button>
                  {c.owner_id !== user?.id && (
                    <Button size="sm" variant="ghost" onClick={() => handleLeave(c.id)} className="gap-1 text-destructive">
                      <LogOut className="h-3 w-3" /> Leave
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => {
                      if (c.invite_code) {
                        navigator.clipboard.writeText(c.invite_code);
                        toast.success('Invite code copied');
                      } else {
                        toast.error('No invite code available');
                      }
                    }}
                    title="Copy invite code"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-[#13101a] border border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Create Community</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="NM Gaming" className="bg-[#0a0810] border-white/10" maxLength={50} />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="A place to hang out" className="bg-[#0a0810] border-white/10" maxLength={280} />
            </div>
            <p className="text-xs text-muted-foreground">
              Your community will be created with default channels (#announcements, #rules, #general, #media) and a voice channel (🔊 Lounge). An invite code will be generated automatically.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={loading || !newName.trim()} className="bg-nexus-violet hover:bg-nexus-violet/80">
              {loading ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Join dialog */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="bg-[#13101a] border border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Join Community</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Invite Code</Label>
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="abc123de"
                className="bg-[#0a0810] border-white/10 font-mono"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Paste an invite code you received from a community owner.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJoinOpen(false)}>Cancel</Button>
            <Button onClick={handleJoin} disabled={loading || !joinCode.trim()} className="bg-nexus-violet hover:bg-nexus-violet/80">
              {loading ? 'Joining…' : 'Join'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
