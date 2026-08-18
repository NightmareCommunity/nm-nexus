'use client';

import { Home, MessageSquare, Users, Phone, Settings } from 'lucide-react';
import { useUIStore, type MobileTab } from '@/lib/stores/ui-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const TABS: { id: MobileTab; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" /> },
  { id: 'chats', label: 'Chats', icon: <MessageSquare className="h-5 w-5" /> },
  { id: 'communities', label: 'Spaces', icon: <Users className="h-5 w-5" /> },
  { id: 'calls', label: 'Calls', icon: <Phone className="h-5 w-5" /> },
  { id: 'settings', label: 'Me', icon: <Settings className="h-5 w-5" /> },
];

export function MobileNav() {
  const { mobileTab, setMobileTab } = useUIStore();
  const { profile } = useAuthStore();

  return (
    <nav className="shrink-0 h-16 grid grid-cols-5 bg-[#0a0810] border-t border-white/5 safe-area-bottom">
      {TABS.map((tab) => {
        const isActive = mobileTab === tab.id;
        const isMe = tab.id === 'settings';
        return (
          <button
            key={tab.id}
            onClick={() => setMobileTab(tab.id)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 transition-colors',
              isActive ? 'text-nexus-lavender' : 'text-muted-foreground hover:text-white'
            )}
          >
            {isMe && profile ? (
              <Avatar className="h-5 w-5">
                {profile.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <AvatarFallback className="text-[8px]" style={{ backgroundColor: profile.avatar_color || '#7c3aed', color: 'white' }}>
                    {(profile.display_name || profile.username || 'U').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
            ) : (
              tab.icon
            )}
            <span className="text-[10px]">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
