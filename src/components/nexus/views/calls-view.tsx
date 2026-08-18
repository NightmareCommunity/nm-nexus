'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { Phone, PhoneMissed, PhoneIncoming, PhoneOutgoing, Video } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type Call = Database['public']['Tables']['calls']['Row'];

interface CallWithOther extends Call {
  other_user_id: string;
  other_username: string | null;
  other_display_name: string | null;
  other_avatar: string | null;
  other_avatar_color: string;
}

export function CallsView({ mobile = false }: { mobile?: boolean }) {
  const { user } = useAuthStore();
  const [calls, setCalls] = useState<CallWithOther[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();

    // Fetch calls I initiated
    const [outgoing, participated] = await Promise.all([
      supabase
        .from('calls')
        .select('*')
        .eq('initiated_by', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('call_participants')
        .select('call_id, calls!inner(*)')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: false })
        .limit(50),
    ]);

    if (outgoing.error) console.warn('outgoing calls err', outgoing.error);
    if (participated.error) console.warn('participated calls err', participated.error);

    const outgoingCalls = (outgoing.data || []) as Call[];
    const incomingCalls = (participated.data || [])
      .map((p: any) => p.calls as Call)
      .filter((c) => c && c.initiated_by !== user.id);

    // Deduplicate by call id (in case I initiated AND was a participant)
    const seen = new Set<string>();
    const all: Call[] = [];
    for (const c of [...outgoingCalls, ...incomingCalls]) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        all.push(c);
      }
    }
    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (all.length === 0) {
      setCalls([]);
      setLoading(false);
      return;
    }

    // Resolve the "other user" for each call (the party that isn't me)
    const otherIds = Array.from(
      new Set(all.map((c) => (c.initiated_by === user.id ? '' : c.initiated_by)))
    ).filter(Boolean);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar, avatar_color')
      .in('id', otherIds);
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    const enriched: CallWithOther[] = all.map((c) => {
      const otherId = c.initiated_by === user.id ? '' : c.initiated_by;
      const p = otherId ? profileMap.get(otherId) : null;
      return {
        ...c,
        other_user_id: otherId,
        other_username: p?.username ?? null,
        other_display_name: p?.display_name ?? null,
        other_avatar: p?.avatar ?? null,
        other_avatar_color: p?.avatar_color ?? '#7c3aed',
      };
    });
    setCalls(enriched);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex-1 flex flex-col bg-[#0a0810]">
      <div className="h-12 px-4 flex items-center border-b border-white/5 shadow-sm shrink-0">
        <span className="font-semibold text-white">Calls</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
        ) : calls.length === 0 ? (
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-full bg-nexus-violet/20 flex items-center justify-center mx-auto mb-3">
              <Phone className="h-7 w-7 text-nexus-lavender" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">No calls yet</h3>
            <p className="text-sm text-muted-foreground">
              Start a call from any DM conversation.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {calls.map((c) => {
              const isIncoming = c.initiated_by !== user?.id;
              const isMissed = c.status === 'missed';
              const isVideo = c.type === 'video';
              const otherName = c.other_display_name || c.other_username || 'Unknown';
              const durationLabel =
                c.started_at && c.ended_at
                  ? `${Math.round((new Date(c.ended_at).getTime() - new Date(c.started_at).getTime()) / 1000)}s`
                  : '—';
              return (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded hover:bg-white/5">
                  <div className={cn(
                    'h-10 w-10 rounded-full flex items-center justify-center',
                    isMissed ? 'bg-red-500/20' : 'bg-nexus-violet/20'
                  )}>
                    {isMissed ? <PhoneMissed className="h-4 w-4 text-red-400" /> :
                      isIncoming ? <PhoneIncoming className="h-4 w-4 text-nexus-lavender" /> :
                      <PhoneOutgoing className="h-4 w-4 text-green-500" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-white flex items-center gap-2">
                      {otherName}
                      {isVideo && <Video className="h-3 w-3 text-muted-foreground" />}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })} · {c.status} · {durationLabel}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
