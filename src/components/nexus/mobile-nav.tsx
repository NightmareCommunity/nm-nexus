'use client';

import { Home, MessageSquare, Users, Phone, Settings } from 'lucide-react';
import { useUIStore, type MobileTab } from '@/lib/stores/ui-store';

const TABS: { id: MobileTab; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" /> },
  { id: 'chats', label: 'Chats', icon: <MessageSquare className="h-5 w-5" /> },
  { id: 'communities', label: 'Spaces', icon: <Users className="h-5 w-5" /> },
  { id: 'calls', label: 'Calls', icon: <Phone className="h-5 w-5" /> },
  { id: 'settings', label: 'Me', icon: <Settings className="h-5 w-5" /> },
];

export function MobileNav() {
  const { mobileTab, setMobileTab, setActiveConversation, setActiveChannel } = useUIStore();

  const handleTab = (t: MobileTab) => {
    setActiveConversation(null);
    setActiveChannel(null);
    setMobileTab(t);
  };

  return (
    <nav className="shrink-0 h-16 grid grid-cols-5 bg-sidebar border-t border-sidebar-border safe-area-bottom">
      {TABS.map((tab) => {
        const isActive = mobileTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => handleTab(tab.id)}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
              isActive ? 'text-nexus-lavender' : 'text-muted-foreground'
            }`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={tab.label}
          >
            <span className={`flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
              isActive ? 'bg-primary/20' : ''
            }`}>
              {tab.icon}
            </span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
