'use client';

import { useEffect, useState } from 'react';
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
import { Plus, Compass, Users, Hash, Volume2, LogOut, Trash2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

  const load = async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('community_members')
      .select('community_id, communities!inner(*)')
      .eq('user_id', user.id);
    setCommunities((data || []).map((d: any) => d.communities as Community));
  };

  useEffect(() => { load(); }, [user]);

  const createCommunity = async () => {
    if (!user || !newName.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const slug = newName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 30);
    const { data: comm, error } = await supabase
      .from('communities')
      .insert({
        owner_id: user.id,
        name: newName.trim(),
        slug,
        description: newDesc.trim() || null,
        is_public: true,
      })
      .select()
      .single();
    if (error) { toast.error(error.message); setLoading(false); return; }
    // Add owner as member with 'owner' role
    await supabase.from('community_members').insert({
      community_id: comm.id,
      user_id: user.id,
      role: 'owner',
    });
    // Create default channels
    await supabase.from('channels').insert([
      { community_id: comm.id, name: 'general', type: 'text', position: 0 },
      { community_id: comm.id, name: 'announcements', type: 'text', position: 1 },
      { community_id: comm.id, name: 'Lounge', type: 'voice', position: 2 },
    ]);
    toast.success('Community created');
    setCreateOpen(false);
    setNewName('');
    setNewDesc('');
    setLoading(false);
    load();
    // Navigate to it
    setActiveCommunity(comm.id);
    setActiveView('communities');
  };

  const joinCommunity = async () => {
    if (!user || !joinCode.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const { data: comm, error: findErr } = await supabase
      .from('communities')
      .select('*')
      .eq('invite_code', joinCode.trim())
      .maybeSingle();
    if (findErr || !comm) {
      toast.error('Community not found with that invite code');
      setLoading(false);
      return;
    }
    const { error: joinErr } = await supabase.from('community_members').insert({
      community_id: comm.id,
      user_id: user.id,
      role: 'member',
    });
    if (joinErr) {
      if (joinErr.code === '23505') toast.error('Already a member');
      else toast.error(joinErr.message);
    } else {
      toast.success(`Joined ${comm.name}`);
      setJoinOpen(false);
      setJoinCode('');
      load();
    }
    setLoading(false);
  };

  const leaveCommunity = async (id: string) => {
    if (!user) return;
    const supabase = createClient();
    await supabase.from('community_members')
      .delete()
      .eq('community_id', id)
      .eq('user_id', user.id);
    toast.success('Left community');
    load();
  };

  const openCommunity = (c: Community) => {
    setActiveCommunity(c.id);
    setActiveChannel(null, c.id);
    setActiveView('communities');
    // The channel sidebar will pick this up
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
              <div className="h-20 bg-gradient-to-br from-nexus-violet/30 to-nexus-lavender/10 relative">
                {c.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.icon} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
                )}
              </div>
              <div className="p-4">
                <h3 className="font-bold text-white">{c.name}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{c.description || 'No description'}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" onClick={() => openCommunity(c)} className="gap-1 bg-nexus-violet hover:bg-nexus-violet/80">
                    Open
                  </Button>
                  {c.owner_id !== user?.id && (
                    <Button size="sm" variant="ghost" onClick={() => leaveCommunity(c.id)} className="gap-1 text-destructive">
                      <LogOut className="h-3 w-3" /> Leave
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => {
                      navigator.clipboard.writeText(c.invite_code || '');
                      toast.success('Invite code copied');
                    }}
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
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="NM Gaming" className="bg-[#0a0810] border-white/10" />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="A place to hang out" className="bg-[#0a0810] border-white/10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createCommunity} disabled={loading || !newName.trim()} className="bg-nexus-violet hover:bg-nexus-violet/80">
              Create
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
              <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="abc123def4" className="bg-[#0a0810] border-white/10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJoinOpen(false)}>Cancel</Button>
            <Button onClick={joinCommunity} disabled={loading || !joinCode.trim()} className="bg-nexus-violet hover:bg-nexus-violet/80">
              Join
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
