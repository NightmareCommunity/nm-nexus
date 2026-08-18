'use client';

import { create } from 'zustand';

export type NexusView =
  | 'home'
  | 'dms'
  | 'friends'
  | 'communities'
  | 'calls'
  | 'settings';

export type MobileTab = 'home' | 'chats' | 'communities' | 'calls' | 'settings';

export type MobileSheet = 'none' | 'members' | 'channels' | 'community-list' | 'profile' | 'settings';

interface UIState {
  // Desktop navigation
  activeView: NexusView;
  setActiveView: (v: NexusView) => void;

  // Active conversation/channel/community
  activeConversationId: string | null;
  activeChannelId: string | null;
  activeCommunityId: string | null;
  setActiveConversation: (id: string | null) => void;
  setActiveChannel: (id: string | null, communityId?: string | null) => void;
  setActiveCommunity: (id: string | null) => void;

  // Active user profile (for profile card modal)
  activeProfileUserId: string | null;
  setActiveProfileUserId: (id: string | null) => void;

  // Mobile
  mobileTab: MobileTab;
  setMobileTab: (t: MobileTab) => void;
  mobileSheetOpen: MobileSheet;
  setMobileSheetOpen: (s: MobileSheet) => void;

  // Right panel (desktop)
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;

  // Call overlay
  callOverlayOpen: boolean;
  callType: 'voice' | 'video' | null;
  callTarget: { id: string; name: string; avatar?: string } | null;
  startCall: (type: 'voice' | 'video', target: { id: string; name: string; avatar?: string }) => void;
  endCall: () => void;

  // Settings subsection
  settingsSection: string;
  setSettingsSection: (s: string) => void;

  // Command palette / global search
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeView: 'home',
  setActiveView: (v) => set({ activeView: v, activeConversationId: null, activeChannelId: null }),

  activeConversationId: null,
  activeChannelId: null,
  activeCommunityId: null,
  setActiveConversation: (id) => set({ activeConversationId: id, activeChannelId: null }),
  setActiveChannel: (id, communityId) =>
    set({ activeChannelId: id, activeConversationId: null, activeCommunityId: communityId ?? null }),
  setActiveCommunity: (id) => set({ activeCommunityId: id }),

  activeProfileUserId: null,
  setActiveProfileUserId: (id) => set({ activeProfileUserId: id }),

  mobileTab: 'home',
  setMobileTab: (t) => set({ mobileTab: t, activeConversationId: null, activeChannelId: null }),
  mobileSheetOpen: 'none',
  setMobileSheetOpen: (s) => set({ mobileSheetOpen: s }),

  rightPanelOpen: true,
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),

  callOverlayOpen: false,
  callType: null,
  callTarget: null,
  startCall: (type, target) =>
    set({ callOverlayOpen: true, callType: type, callTarget: target }),
  endCall: () =>
    set({ callOverlayOpen: false, callType: null, callTarget: null }),

  settingsSection: 'account',
  setSettingsSection: (s) => set({ settingsSection: s }),

  commandOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),
}));
