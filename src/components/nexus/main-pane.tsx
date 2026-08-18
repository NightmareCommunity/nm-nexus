'use client';

import { useUIStore } from '@/lib/stores/ui-store';
import { HomeView } from '@/components/nexus/views/home-view';
import { DmsView } from '@/components/nexus/views/dms-view';
import { CommunitiesView } from '@/components/nexus/views/communities-view';
import { ContactsView } from '@/components/nexus/views/contacts-view';
import { CallsView } from '@/components/nexus/views/calls-view';
import { SettingsView } from '@/components/nexus/views/settings-view';
import { ChatPane } from '@/components/nexus/chat/chat-pane';

export function MainPane({ mobile = false }: { mobile?: boolean }) {
  const { activeView, activeConversationId, activeChannelId, mobileTab } = useUIStore();

  // On mobile: if a conversation/channel is active, show chat full-screen
  if (mobile) {
    if (mobileTab === 'chats' && (activeConversationId || activeChannelId)) {
      return <ChatPane mobile />;
    }
    switch (mobileTab) {
      case 'home': return <HomeView mobile />;
      case 'chats': return <DmsView mobile />;
      case 'communities': return <CommunitiesView mobile />;
      case 'calls': return <CallsView mobile />;
      case 'settings': return <SettingsView mobile />;
    }
  }

  // Desktop: if conversation/channel active, show chat; else show the active view
  if (activeConversationId || activeChannelId) {
    return <ChatPane />;
  }

  switch (activeView) {
    case 'home': return <HomeView />;
    case 'dms': return <DmsView />;
    case 'communities': return <CommunitiesView />;
    case 'contacts': return <ContactsView />;
    case 'calls': return <CallsView />;
    case 'settings': return <SettingsView />;
    default: return <HomeView />;
  }
}
