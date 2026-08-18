'use client';

import { useState } from 'react';
import { Phone, Video, PhoneIncoming, PhoneMissed, PhoneOutgoing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useUIStore } from '@/lib/stores/ui-store';

const RECENT_CALLS = [
  // Placeholder data — in production, fetch from `calls` table
];

export function CallsView({ mobile = false }: { mobile?: boolean }) {
  const { setCallOverlayOpen } = useUIStore();
  const [starting, setStarting] = useState<'voice' | 'video' | null>(null);

  const startCall = (type: 'voice' | 'video') => {
    setStarting(type);
    setCallOverlayOpen(true);
  };

  return (
    <div className="h-full flex flex-col">
      <header className="h-16 flex items-center px-4 border-b border-border">
        <h1 className="font-semibold">Calls</h1>
      </header>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-24 flex flex-col items-center gap-2 nexus-glass hover:bg-accent/40"
            onClick={() => startCall('voice')}
          >
            <Phone className="h-6 w-6 text-nexus-lavender" />
            <span>Start voice call</span>
          </Button>
          <Button
            variant="outline"
            className="h-24 flex flex-col items-center gap-2 nexus-glass hover:bg-accent/40"
            onClick={() => startCall('video')}
          >
            <Video className="h-6 w-6 text-nexus-lavender" />
            <span>Start video call</span>
          </Button>
        </div>

        <Card className="nexus-glass p-4">
          <h2 className="text-sm font-medium mb-3">Recent calls</h2>
          {RECENT_CALLS.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">
              No recent calls. Start one above — calls use WebRTC with STUN/TURN fallback.
            </div>
          ) : (
            <div className="space-y-1">
              {/* Map over recent calls */}
            </div>
          )}
        </Card>

        <Card className="nexus-glass p-4">
          <h2 className="text-sm font-medium mb-2">About calls</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            NM NEXUS uses WebRTC for all voice and video calls. Signaling is exchanged via the
            <code className="mx-1 px-1 py-0.5 rounded bg-muted/50 text-[10px]">call_signaling</code>
            table (protected by RLS — only sender and recipient can read their own signals).
            Media flows peer-to-peer when possible; TURN servers relay traffic when NAT traversal fails.
            Configure STUN/TURN URLs in your environment variables.
          </p>
        </Card>
      </div>
    </div>
  );
}
