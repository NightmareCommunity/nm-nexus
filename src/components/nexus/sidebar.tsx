'use client';

import { Home, MessageSquare, Users, Phone, Settings, LogOut, Search } from 'lucide-react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore, type NexusView } from '@/lib/stores/ui-store';
import { BrandMark } from '@/components/nexus/auth/auth-screen';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { CommandSearch } from '@/components/nexus/command-search';
import { toast } from 'sonner';

const NAV_ITEMS: { id: NexusView; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <Home className="h-5 w-5" /> },
  { id: 'dms', label: 'Direct Messages', icon: <MessageSquare className="h-5 w-5" /> },
  { id: 'communities', label: 'Communities', icon: <Users className="h-5 w-5" /> },
  { id: 'contacts', label: 'Contacts', icon: <Users className="h-5 w-5" /> },
  { id: 'calls', label: 'Calls', icon: <Phone className="h-5 w-5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
];

export function Sidebar() {
  const { activeView, setActiveView } = useUIStore();
  const { profile, signOut } = useAuthStore();
  const [searchOpen, setSearchOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
  };

  return (
    <aside className="w-16 lg:w-64 shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border">
      {/* Brand */}
      <div className="h-16 flex items-center px-3 lg:px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 lg:gap-3">
          <BrandMark size="sm" />
          <div className="hidden lg:block">
            <div className="font-bold text-sm nexus-violet-text leading-tight">NM NEXUS</div>
            <div className="text-[10px] text-muted-foreground">NIGHTMARE STUDIOS</div>
          </div>
        </div>
      </div>

      {/* Search trigger */}
      <div className="p-2 lg:p-3">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center justify-center lg:justify-start gap-2 px-2 py-2 rounded-md bg-accent/40 hover:bg-accent/60 text-sm text-muted-foreground transition-colors"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
          <span className="hidden lg:inline">Search…</span>
          <kbd className="hidden lg:inline ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted/50 border border-border">⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 lg:px-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center justify-center lg:justify-start gap-3 px-2 py-2.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-primary/20 text-foreground border border-primary/30'
                  : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground border border-transparent'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={isActive ? 'text-nexus-lavender' : ''}>{item.icon}</span>
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Profile footer */}
      <div className="p-2 lg:p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 lg:gap-3">
          <Avatar className="h-9 w-9 ring-2 ring-primary/30">
            <AvatarFallback
              className="text-xs font-medium"
              style={{ backgroundColor: profile?.avatar_color || '#7c3aed', color: 'white' }}
            >
              {(profile?.display_name || profile?.username || 'U').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="hidden lg:flex-1 min-w-0">
            <div className="text-xs font-medium truncate">
              {profile?.display_name || profile?.username || 'User'}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              @{profile?.username || 'unknown'}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={handleSignOut}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </aside>
  );
}
