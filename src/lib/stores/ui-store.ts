'use client';

import { create } from 'zustand';

export type NexusView =
  | 'home'
  | 'dms'
  | 'communities'
  | 'contacts'
  | 'calls'
  | 'settings';

export type MobileTab = 'home' | 'chats' | 'communities' | 'calls' | 'settings';

interface UIState {
  // Desktop navigation
  activeView: NexusView;
  setActiveView: (v: NexusView) => void;

  // Active conversation/channel
  activeConversationId: string | null;
  activeChannelId: string | null;
  setActiveConversation: (id: string | null) => void;
  setActiveChannel: (id: string | null) => void;

  // Mobile
  mobileTab: MobileTab;
  setMobileTab: (t: MobileTab) => void;
  mobileSheetOpen: 'none' | 'members' | 'files' | 'details' | 'channels';
  setMobileSheetOpen: (s: UIState['mobileSheetOpen']) => void;

  // Right panel (desktop)
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;

  // Call overlay
  callOverlayOpen: boolean;
  setCallOverlayOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeView: 'home',
  setActiveView: (v) => set({ activeView: v }),

  activeConversationId: null,
  activeChannelId: null,
  setActiveConversation: (id) => set({ activeConversationId: id, activeChannelId: null }),
  setActiveChannel: (id) => set({ activeChannelId: id, activeConversationId: null }),

  mobileTab: 'home',
  setMobileTab: (t) => set({ mobileTab: t }),
  mobileSheetOpen: 'none',
  setMobileSheetOpen: (s) => set({ mobileSheetOpen: s }),

  rightPanelOpen: false,
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),

  callOverlayOpen: false,
  setCallOverlayOpen: (open) => set({ callOverlayOpen: open }),
}));
