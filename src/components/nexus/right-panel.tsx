'use client';

import { useUIStore } from '@/lib/stores/ui-store';
import { Button } from '@/components/ui/button';
import { X, Users, FileText, Info } from 'lucide-react';

export function RightPanel() {
  const { setRightPanelOpen, activeConversationId, activeChannelId } = useUIStore();

  return (
    <aside className="w-72 xl:w-80 shrink-0 flex flex-col bg-sidebar/50 border-l border-sidebar-border">
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        <div className="text-sm font-medium">Details</div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setRightPanelOpen(false)}
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        <PanelSection icon={<Users className="h-4 w-4" />} title="Members">
          <p className="text-xs text-muted-foreground">
            Member list will appear here for groups and community channels.
          </p>
        </PanelSection>
        <PanelSection icon={<FileText className="h-4 w-4" />} title="Files">
          <p className="text-xs text-muted-foreground">
            Shared files will appear here.
          </p>
        </PanelSection>
        <PanelSection icon={<Info className="h-4 w-4" />} title="Info">
          <p className="text-xs text-muted-foreground">
            {activeConversationId ? 'Conversation details' : activeChannelId ? 'Channel details' : 'Select a conversation'}
          </p>
        </PanelSection>
      </div>
    </aside>
  );
}

function PanelSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="rounded-md bg-accent/20 p-3 border border-border/40">
        {children}
      </div>
    </div>
  );
}
