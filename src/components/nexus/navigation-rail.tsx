'use client';

import { Home, MessageSquare, Users, Phone, Settings, Plus, Compass } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore, type NexusView } from '@/lib/stores/ui-store';
import { BrandMark } from '@/components/nexus/auth/auth-screen';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const NAV_ITEMS: { id: NexusView; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" /> },
  { id: 'dms', label: 'Direct Messages', icon: <MessageSquare className="h-5 w-5" /> },
  { id: 'friends', label: 'Friends', icon: <Users className="h-5 w-5" /> },
  { id: 'communities', label: 'Communities', icon: <Compass className="h-5 w-5" /> },
  { id: 'calls', label: 'Calls', icon: <Phone className="h-5 w-5" /> },
];

export function NavigationRail() {
  const { activeView, setActiveView, setActiveChannel, setActiveConversation } = useUIStore();
  const { profile, signOut } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleNav = (v: NexusView) => {
    setActiveChannel(null);
    setActiveConversation(null);
    setActiveView(v);
  };

  return (
    <aside className="w-[72px] shrink-0 flex flex-col items-center bg-[#0a0810] border-r border-white/5 py-3 gap-2">
      {/* Brand */}
      <button
        onClick={() => handleNav('home')}
        className="h-12 w-12 rounded-2xl overflow-hidden hover:rounded-xl transition-all nexus-pressable"
        aria-label="NM NEXUS home"
      >
        <BrandMark size="sm" />
      </button>

      <div className="w-8 h-px bg-white/10 my-1" />

      {/* Primary nav */}
      <nav className="flex flex-col items-center gap-2 flex-1 overflow-y-auto scrollbar-none">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <div key={item.id} className="relative group">
              <button
                onClick={() => handleNav(item.id)}
                className={cn(
                  'h-12 w-12 flex items-center justify-center rounded-2xl transition-all',
                  isActive
                    ? 'rounded-xl bg-nexus-violet text-white'
                    : 'bg-[#1a1525] text-muted-foreground hover:bg-[#241d35] hover:text-foreground hover:rounded-xl'
                )}
                aria-label={item.label}
              >
                {item.icon}
              </button>
              {/* Tooltip */}
              <div className="absolute left-16 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-md bg-black text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                {item.label}
              </div>
              {/* Active indicator */}
              {isActive && (
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-r-full bg-white" />
              )}
            </div>
          );
        })}

        <div className="w-8 h-px bg-white/10 my-1" />

        {/* Communities quick access — show joined community icons */}
        <CommunityShortcuts />

        {/* Add community button */}
        <button
          onClick={() => handleNav('communities')}
          className="h-12 w-12 flex items-center justify-center rounded-2xl bg-[#1a1525] text-nexus-lavender hover:bg-nexus-violet hover:text-white hover:rounded-xl transition-all"
          aria-label="Add community"
        >
          <Plus className="h-5 w-5" />
        </button>
      </nav>

      {/* User area */}
      <div className="relative">
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="h-12 w-12 rounded-full overflow-hidden ring-2 ring-nexus-violet/40 hover:ring-nexus-lavender transition-all"
          aria-label="User menu"
        >
          <Avatar className="h-full w-full">
            {profile?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar} alt={profile.username} className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback
                className="text-xs font-medium"
                style={{ backgroundColor: profile?.avatar_color || '#7c3aed', color: 'white' }}
              >
                {(profile?.display_name || profile?.username || 'U').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
        </button>
        {/* Online indicator */}
        <div className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-[#0a0810]" />

        {/* User dropdown */}
        {showUserMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowUserMenu(false)}
            />
            <div className="absolute bottom-14 left-0 w-56 rounded-lg bg-[#1a1525] border border-white/10 shadow-2xl p-1 z-50">
              <div className="px-3 py-2 border-b border-white/5">
                <div className="text-sm font-medium truncate">
                  {profile?.display_name || profile?.username || 'User'}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  @{profile?.username || 'unknown'}
                </div>
              </div>
              <button
                onClick={() => { handleNav('settings'); setShowUserMenu(false); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-white/5 rounded flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
              <button
                onClick={async () => {
                  await signOut();
                  toast.success('Signed out');
                  setShowUserMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-white/5 rounded text-destructive flex items-center gap-2"
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function CommunityShortcuts() {
  const { profile } = useAuthStore();
  const { setActiveChannel, setActiveView } = useUIStore();
  const [communities, setCommunities] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    supabase
      .from('community_members')
      .select('community_id, communities!inner(id, name, icon)')
      .eq('user_id', profile.id)
      .then(({ data }) => {
        if (data) setCommunities(data.map((d: any) => d.communities));
      });
  }, [profile]);

  if (communities.length === 0) return null;

  return (
    <>
      {communities.slice(0, 8).map((c) => (
        <div key={c.id} className="relative group">
          <button
            onClick={() => {
              setActiveView('communities');
              setActiveChannel(null, c.id);
            }}
            className="h-12 w-12 rounded-2xl overflow-hidden bg-[#1a1525] hover:rounded-xl hover:bg-nexus-violet transition-all flex items-center justify-center"
            aria-label={c.name}
          >
            {c.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.icon} alt={c.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-nexus-lavender">
                {c.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </button>
          <div className="absolute left-16 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-md bg-black text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            {c.name}
          </div>
        </div>
      ))}
    </>
  );
}
