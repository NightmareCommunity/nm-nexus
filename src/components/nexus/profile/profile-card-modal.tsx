'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
import { MessageSquare, Phone, Video, UserPlus, UserMinus, X, Ban, Check } from 'lucide-react';
import {
  startDmWithUser,
  sendFriendRequest,
  respondToFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
} from '@/lib/nexus-helpers';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Friendship = Database['public']['Tables']['friendships']['Row'];

type RelationState = 'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked';

export function ProfileCardModal() {
  const { activeProfileUserId, setActiveProfileUserId, startCall, setActiveConversation, setActiveView } = useUIStore();
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [relation, setRelation] = useState<RelationState>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeProfileUserId) {
      setProfile(null);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', activeProfileUserId)
      .maybeSingle();
    if (error) { console.warn('profile card err', error); return; }
    setProfile(data as Profile);

    if (user && activeProfileUserId !== user.id) {
      // Friendships in either direction
      const { data: friendships } = await supabase
        .from('friendships')
        .select('*')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
      const f = (friendships || []).find(
        (x: Friendship) =>
          (x.requester_id === user.id && x.addressee_id === activeProfileUserId) ||
          (x.addressee_id === user.id && x.requester_id === activeProfileUserId)
      );
      // Blocks (I blocked them)
      const { data: blockRow } = await supabase
        .from('blocks')
        .select('blocked_id')
        .eq('blocker_id', user.id)
        .eq('blocked_id', activeProfileUserId)
        .maybeSingle();
      if (blockRow) {
        setRelation('blocked');
        setFriendshipId(null);
      } else if (f) {
        setFriendshipId(f.id);
        if (f.status === 'accepted') setRelation('friends');
        else if (f.status === 'blocked') setRelation('blocked');
        else if (f.requester_id === user.id) setRelation('pending_out');
        else setRelation('pending_in');
      } else {
        setRelation('none');
        setFriendshipId(null);
      }
    }
  }, [activeProfileUserId, user]);

  useEffect(() => { load(); }, [load]);

  if (!activeProfileUserId || !profile) return null;

  const isMe = user?.id === profile.id;
  const joinDate = new Date(profile.created_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const handleStartDm = async () => {
    const convId = await startDmWithUser(profile.id);
    if (convId) {
      setActiveConversation(convId);
      setActiveView('dms');
      setActiveProfileUserId(null);
    }
  };

  const handleSendRequest = async () => {
    const ok = await sendFriendRequest(profile.id);
    if (ok) {
      setRelation('pending_out');
      // reload to get the friendship id
      setTimeout(load, 500);
    }
  };

  const handleAcceptRequest = async () => {
    if (!friendshipId) return;
    const ok = await respondToFriendRequest(friendshipId, true);
    if (ok) setRelation('friends');
  };

  const handleDeclineRequest = async () => {
    if (!friendshipId) return;
    const ok = await respondToFriendRequest(friendshipId, false);
    if (ok) setRelation('none');
  };

  const handleRemoveFriend = async () => {
    if (!user) return;
    const ok = await removeFriend(profile.id, user.id);
    if (ok) setRelation('none');
  };

  const handleBlock = async () => {
    if (!user) return;
    if (!confirm(`Block ${profile.display_name || profile.username}? They won't be able to message you.`)) return;
    const ok = await blockUser(profile.id, user.id);
    if (ok) setRelation('blocked');
  };

  const handleUnblock = async () => {
    if (!user) return;
    const ok = await unblockUser(profile.id, user.id);
    if (ok) setRelation('none');
  };

  return (
    <Dialog open={!!activeProfileUserId} onOpenChange={(o) => !o && setActiveProfileUserId(null)}>
      <DialogContent className="bg-[#13101a] border border-white/10 max-w-md p-0 overflow-hidden">
        <div className="h-24 bg-gradient-to-br from-nexus-violet/40 to-nexus-lavender/20 relative">
          {profile.banner && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.banner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" />
          )}
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
            <p className="text-sm text-muted-foreground">
              @{profile.username}
              {profile.discriminator && profile.discriminator !== '0001' ? `#${profile.discriminator}` : ''}
            </p>
            {profile.pronouns && (
              <p className="text-xs text-muted-foreground mt-0.5">{profile.pronouns}</p>
            )}
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
              {relation !== 'blocked' && (
                <>
                  <Button onClick={handleStartDm} variant="default" className="gap-2 bg-nexus-violet hover:bg-nexus-violet/80">
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
                </>
              )}

              {relation === 'none' && (
                <>
                  <Button onClick={handleSendRequest} variant="outline" className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    Add Friend
                  </Button>
                  <Button onClick={handleBlock} variant="ghost" className="gap-2 text-destructive" title="Block user">
                    <Ban className="h-4 w-4" />
                  </Button>
                </>
              )}

              {relation === 'pending_out' && (
                <Button disabled variant="outline" className="gap-2">
                  Pending…
                </Button>
              )}

              {relation === 'pending_in' && (
                <>
                  <Button onClick={handleAcceptRequest} variant="outline" className="gap-2 bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20">
                    <Check className="h-4 w-4" />
                    Accept
                  </Button>
                  <Button onClick={handleDeclineRequest} variant="outline" className="gap-2 text-destructive">
                    Decline
                  </Button>
                </>
              )}

              {relation === 'friends' && (
                <>
                  <Button onClick={handleRemoveFriend} variant="outline" className="gap-2 text-destructive">
                    <UserMinus className="h-4 w-4" />
                    Remove Friend
                  </Button>
                  <Button onClick={handleBlock} variant="ghost" className="gap-2 text-destructive" title="Block user">
                    <Ban className="h-4 w-4" />
                  </Button>
                </>
              )}

              {relation === 'blocked' && (
                <Button onClick={handleUnblock} variant="outline" className="gap-2">
                  Unblock
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
