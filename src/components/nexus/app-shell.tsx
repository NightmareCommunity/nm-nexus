'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { AuthScreen } from '@/components/nexus/auth/auth-screen';
import { Sidebar } from '@/components/nexus/sidebar';
import { MainPane } from '@/components/nexus/main-pane';
import { RightPanel } from '@/components/nexus/right-panel';
import { MobileNav } from '@/components/nexus/mobile-nav';
import { CallOverlay } from '@/components/nexus/calls/call-overlay';
import { Loader2 } from 'lucide-react';
import { BrandMark } from '@/components/nexus/auth/auth-screen';

export function AppShell() {
  const { user, initialized, init } = useAuthStore();
  const { rightPanelOpen, callOverlayOpen } = useUIStore();

  useEffect(() => {
    init();
  }, [init]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <BrandMark size="md" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Establishing secure channel…
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Desktop layout */}
      <div className="hidden md:flex h-full">
        <Sidebar />
        <MainPane />
        {rightPanelOpen && <RightPanel />}
      </div>

      {/* Mobile layout */}
      <div className="md:hidden flex flex-col h-full">
        <div className="flex-1 overflow-hidden">
          <MainPane mobile />
        </div>
        <MobileNav />
      </div>

      {/* Call overlay — always on top */}
      {callOverlayOpen && <CallOverlay />}
    </div>
  );
}
