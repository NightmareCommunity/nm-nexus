'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { AuthScreen } from '@/components/nexus/auth/auth-screen';
import { NavigationRail } from '@/components/nexus/navigation-rail';
import { ChannelSidebar } from '@/components/nexus/channel-sidebar';
import { MainPane } from '@/components/nexus/main-pane';
import { MemberPanel } from '@/components/nexus/member-panel';
import { MobileNav } from '@/components/nexus/mobile-nav';
import { CallOverlay } from '@/components/nexus/calls/call-overlay';
import { ProfileCardModal } from '@/components/nexus/profile/profile-card-modal';
import { Loader2, AlertTriangle, RotateCcw } from 'lucide-react';
import { BrandMark } from '@/components/nexus/auth/auth-screen';
import { Button } from '@/components/ui/button';

export function AppShell() {
  const { user, initialized, initError, init, retryInit } = useAuthStore();
  const { rightPanelOpen, callOverlayOpen, activeConversationId, activeChannelId, activeView } = useUIStore();

  useEffect(() => {
    init();
  }, [init]);

  // Loading state — but capped by init() timeout (8s). Never infinite.
  if (!initialized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <BrandMark size="md" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Establishing secure channel…
        </div>
        <p className="text-[10px] text-muted-foreground/60">
          If this takes more than a few seconds, check your connection.
        </p>
      </div>
    );
  }

  // Init failed — show retry, NEVER leave user on spinner.
  if (initError && !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <BrandMark size="md" />
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Couldn&apos;t reach the server
        </div>
        <p className="text-sm text-muted-foreground text-center max-w-sm">{initError}</p>
        <Button onClick={() => retryInit()} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  // Whether to show the channel/DM sidebar (depends on active view)
  const showChannelSidebar =
    activeView === 'dms' ||
    activeView === 'communities' ||
    activeConversationId !== null ||
    activeChannelId !== null;

  // Whether to show the member panel (only in communities with a channel active)
  const showMemberPanel =
    rightPanelOpen &&
    (activeChannelId !== null || activeView === 'communities');

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Desktop layout: rail | channel sidebar | chat | members */}
      <div className="hidden md:flex h-full">
        <NavigationRail />
        {showChannelSidebar && <ChannelSidebar />}
        <MainPane />
        {showMemberPanel && <MemberPanel />}
      </div>

      {/* Mobile layout: chat is main, bottom nav switches tabs */}
      <div className="md:hidden flex flex-col h-full">
        <div className="flex-1 overflow-hidden">
          <MainPane mobile />
        </div>
        <MobileNav />
      </div>

      {/* Overlays */}
      {callOverlayOpen && <CallOverlay />}
      <ProfileCardModal />
    </div>
  );
}
