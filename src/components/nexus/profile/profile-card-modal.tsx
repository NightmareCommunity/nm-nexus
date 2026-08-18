'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
import { MessageSquare, Phone, Video, UserPlus, UserMinus, X } from 'lucide-react';
import { toast } from 'sonner';

type Profile = Database['public']['Tables']['profiles']['Row'];

export function ProfileCardModal() {
  const { activeProfileUserId, setActiveProfileUserId, startCall, setActiveConversation, setActiveView } = useUIStore();
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friendship, setFriendship] = useState<'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked'>('none');

  useEffect(() => {
    if (!activeProfileUserId) {
      setProfile(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from('profiles')
      .select('*')
      .eq('id', activeProfileUserId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.warn('profile card err', error); return; }
        setProfile(data);
      });

    if (user && activeProfileUserId !== user.id) {
      supabase
        .from('friendships')
        .select('*')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .then(({ data }) => {
          if (!data) return;
          const f = data.find((x) =>
            (x.requester_id === user.id && x.addressee_id === activeProfileUserId) ||
            (x.addressee_id === user.id && x.requester_id === activeProfileUserId)
          );
          if (f) {
            if (f.status === 'accepted') setFriendship('friends');
            else if (f.status === 'blocked') setFriendship('blocked');
            else if (f.requester_id === user.id) setFriendship('pending_out');
            else setFriendship('pending_in');
          } else {
            setFriendship('none');
          }
        });
    }
  }, [activeProfileUserId, user]);

  if (!activeProfileUserId || !profile) return null;

  const isMe = user?.id === profile.id;
  const joinDate = new Date(profile.created_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const startDm = async () => {
    if (!user) return;
    const supabase = createClient();
    const { data: myMemberships } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', user.id);
    if (myMemberships && myMemberships.length > 0) {
      const { data: theirMemberships } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', profile.id)
        .in('conversation_id', myMemberships.map((m) => m.conversation_id));
      const shared = theirMemberships?.[0]?.conversation_id;
      if (shared) {
        setActiveConversation(shared);
        setActiveView('dms');
        setActiveProfileUserId(null);
        return;
      }
    }
    const { data: conv, error } = await supabase
      .from('conversations')
      .insert({ type: 'direct', is_encrypted: true, created_by: user.id })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    await supabase.from('conversation_members').insert([
      { conversation_id: conv.id, user_id: user.id, role: 'member' },
      { conversation_id: conv.id, user_id: profile.id, role: 'member' },
    ]);
    setActiveConversation(conv.id);
    setActiveView('dms');
    setActiveProfileUserId(null);
  };

  const sendFriendRequest = async () => {
    if (!user) return;
    const supabase = createClient();
    const { error } = await supabase.from('friendships').insert({
      requester_id: user.id,
      addressee_id: profile.id,
      status: 'pending',
    });
    if (error) toast.error(error.message);
    else { toast.success('Friend request sent'); setFriendship('pending_out'); }
  };

  const removeFriend = async () => {
    if (!user) return;
    const supabase = createClient();
    const { error } = await supabase.from('friendships')
      .delete()
      .eq('requester_id', user.id)
      .eq('addressee_id', profile.id);
    if (error) {
      const { error: e2 } = await supabase.from('friendships')
        .delete()
        .eq('addressee_id', user.id)
        .eq('requester_id', profile.id);
      if (e2) toast.error(e2.message);
      else { toast.success('Removed friend'); setFriendship('none'); }
    } else {
      toast.success('Removed friend'); setFriendship('none');
    }
  };

  return (
    <Dialog open={!!activeProfileUserId} onOpenChange={(o) => !o && setActiveProfileUserId(null)}>
      <DialogContent className="bg-[#13101a] border border-white/10 max-w-md p-0 overflow-hidden">
        <div className="h-24 bg-gradient-to-br from-nexus-violet/40 to-nexus-lavender/20 relative">
          <button
            onClick={() => setActiveProfileUserId(null)}
            className="absolute top-2 right-2 p-1 rounded-full bg-black/30 hover:bg-black/50"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>
        <div className="px-4 pb-4 -mt-10">
          <Avatar className="h-20 w-20 ring-4 ring-[#13101a]">
            {profile.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback className="text-xl" style={{ backgroundColor: profile.avatar_color || '#7c3aed', color: 'white' }}>
                {(profile.display_name || profile.username || 'U').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>

          <div className="mt-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">{profile.display_name || profile.username}</h2>
              {profile.status === 'online' && (
                <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
              )}
            </div>
            <p className="text-sm text-muted-foreground">@{profile.username}</p>
            {profile.custom_status && (
              <p className="text-sm text-white/80 mt-1">{profile.custom_status}</p>
            )}
          </div>

          {profile.bio && (
            <div className="mt-4">
              <h3 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">About</h3>
              <p className="text-sm text-white/80">{profile.bio}</p>
            </div>
          )}

          <div className="mt-4">
            <h3 className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Member Since</h3>
            <p className="text-sm text-white/80">{joinDate}</p>
          </div>

          {!isMe && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={startDm} variant="default" className="gap-2 bg-nexus-violet hover:bg-nexus-violet/80">
                <MessageSquare className="h-4 w-4" />
                Message
              </Button>
              <Button onClick={() => startCall('voice', { id: profile.id, name: profile.display_name || profile.username, avatar: profile.avatar || undefined })} variant="outline" className="gap-2">
                <Phone className="h-4 w-4" />
                Call
              </Button>
              <Button onClick={() => startCall('video', { id: profile.id, name: profile.display_name || profile.username, avatar: profile.avatar || undefined })} variant="outline" className="gap-2">
                <Video className="h-4 w-4" />
                Video
              </Button>
              {friendship === 'none' && (
                <Button onClick={sendFriendRequest} variant="outline" className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Add Friend
                </Button>
              )}
              {friendship === 'pending_out' && (
                <Button disabled variant="outline" className="gap-2">
                  Pending…
                </Button>
              )}
              {friendship === 'friends' && (
                <Button onClick={removeFriend} variant="outline" className="gap-2 text-destructive">
                  <UserMinus className="h-4 w-4" />
                  Remove Friend
                </Button>
              )}
            </div>
          )}

          {isMe && (
            <div className="mt-4 p-3 rounded-md bg-white/5 text-sm text-muted-foreground">
              This is you. Edit your profile in Settings.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
