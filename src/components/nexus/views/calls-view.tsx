'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Phone, PhoneMissed, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type Call = Database['public']['Tables']['calls']['Row'];

export function CallsView({ mobile = false }: { mobile?: boolean }) {
  const { user } = useAuthStore();
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    // Calls I initiated or participated in
    supabase
      .from('calls')
      .select('*')
      .or(`initiated_by.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) console.warn('calls load err', error);
        setCalls(data || []);
        setLoading(false);
      });
  }, [user]);

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
                    <div className="text-sm font-medium text-white">
                      {c.type === 'video' ? 'Video call' : 'Voice call'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })} · {c.status}
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
