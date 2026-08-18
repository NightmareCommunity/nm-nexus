'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/database.types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Profile = Database['public']['Tables']['profiles']['Row'];
type CommunityMember = Database['public']['Tables']['community_members']['Row'];

interface MemberWithProfile extends CommunityMember {
  profiles: Profile;
}

export function MemberPanel() {
  const { activeChannelId, activeCommunityId, setActiveProfileUserId, setRightPanelOpen } = useUIStore();
  const { user } = useAuthStore();
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [collapsed, setCollapsed] = useState({ online: false, offline: false, owner: false });

  useEffect(() => {
    if (!activeCommunityId) return;
    const supabase = createClient();
    supabase
      .from('community_members')
      .select('*, profiles!inner(*)')
      .eq('community_id', activeCommunityId)
      .then(({ data, error }) => {
        if (error) { console.warn('member load err', error); return; }
        setMembers((data || []) as unknown as MemberWithProfile[]);
      });
  }, [activeCommunityId, activeChannelId]);

  const onlineMembers = members.filter((m) => m.profiles.status === 'online');
  const offlineMembers = members.filter((m) => m.profiles.status !== 'online');
  const owners = onlineMembers.filter((m) => m.role === 'owner' || m.role === 'admin');
  const regular = onlineMembers.filter((m) => m.role === 'member' || m.role === 'moderator');

  return (
    <aside className="w-60 shrink-0 flex flex-col bg-[#13101a] border-l border-white/5">
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/5 shadow-sm shrink-0">
        <span className="text-sm font-semibold text-white">Members</span>
        <button onClick={() => setRightPanelOpen(false)} className="p-1 rounded hover:bg-white/5">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      <ScrollArea className="flex-1 px-2 py-3">
        {members.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 px-2 py-4 text-center">
            No members yet.
          </p>
        ) : (
          <>
            {owners.length > 0 && (
              <MemberSection
                title={`Admins — ${owners.length}`}
                members={owners}
                collapsed={collapsed.owner}
                onToggle={() => setCollapsed((c) => ({ ...c, owner: !c.owner }))}
                onMemberClick={(m) => setActiveProfileUserId(m.user_id)}
                currentUserId={user?.id}
              />
            )}
            <MemberSection
              title={`Online — ${onlineMembers.length}`}
              members={regular}
              collapsed={collapsed.online}
              onToggle={() => setCollapsed((c) => ({ ...c, online: !c.online }))}
              onMemberClick={(m) => setActiveProfileUserId(m.user_id)}
              currentUserId={user?.id}
            />
            {offlineMembers.length > 0 && (
              <MemberSection
                title={`Offline — ${offlineMembers.length}`}
                members={offlineMembers}
                collapsed={collapsed.offline}
                onToggle={() => setCollapsed((c) => ({ ...c, offline: !c.offline }))}
                onMemberClick={(m) => setActiveProfileUserId(m.user_id)}
                currentUserId={user?.id}
                dimmed
              />
            )}
          </>
        )}
      </ScrollArea>
    </aside>
  );
}

function MemberSection({
  title, members, collapsed, onToggle, onMemberClick, currentUserId, dimmed = false,
}: {
  title: string;
  members: MemberWithProfile[];
  collapsed: boolean;
  onToggle: () => void;
  onMemberClick: (m: MemberWithProfile) => void;
  currentUserId?: string;
  dimmed?: boolean;
}) {
  if (members.length === 0) return null;
  return (
    <div className="mb-3">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground hover:text-white/80"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {title}
      </button>
      {!collapsed && (
        <div className="space-y-0.5">
          {members.map((m) => (
            <button
              key={m.user_id}
              onClick={() => onMemberClick(m)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1 rounded text-sm hover:bg-white/5 group',
                dimmed && 'opacity-50 hover:opacity-100'
              )}
            >
              <div className="relative shrink-0">
                <Avatar className="h-7 w-7">
                  {m.profiles.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.profiles.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <AvatarFallback className="text-[10px]" style={{ backgroundColor: m.profiles.avatar_color || '#7c3aed', color: 'white' }}>
                      {(m.profiles.display_name || m.profiles.username || 'U').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                {!dimmed && (
                  <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-[#13101a]" />
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="truncate text-xs font-medium" style={{ color: m.role === 'owner' ? '#d4af37' : m.role === 'admin' ? '#c4b5fd' : undefined }}>
                  {m.profiles.display_name || m.profiles.username}
                  {m.user_id === currentUserId && <span className="text-muted-foreground ml-1">(you)</span>}
                </div>
                {m.profiles.custom_status && (
                  <div className="truncate text-[10px] text-muted-foreground">{m.profiles.custom_status}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
