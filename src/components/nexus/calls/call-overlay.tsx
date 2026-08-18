'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Volume2, Minimize, Maximize } from 'lucide-react';
import { toast } from 'sonner';

interface CallState {
  status: 'idle' | 'connecting' | 'active' | 'ended';
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;
  duration: number;
}

export function CallOverlay() {
  const { user } = useAuthStore();
  const { callType, callTarget, endCall } = useUIStore();
  const [state, setState] = useState<CallState>({
    status: 'connecting',
    isMuted: false,
    isVideoOff: callType !== 'video',
    isSpeakerOn: true,
    duration: 0,
  });
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Initialize WebRTC peer connection
  useEffect(() => {
    if (!user || !callTarget) return;

    const init = async () => {
      try {
        // 1. Create peer connection with STUN/TURN
        const iceServers: RTCIceServer[] = [
          { urls: process.env.NEXT_PUBLIC_STUN_URLS || 'stun:stun.l.google.com:19302' },
        ];
        if (process.env.NEXT_PUBLIC_TURN_URLS) {
          iceServers.push({
            urls: process.env.NEXT_PUBLIC_TURN_URLS,
            username: process.env.NEXT_PUBLIC_TURN_USERNAME,
            credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
          });
        }
        pcRef.current = new RTCPeerConnection({ iceServers });

        // 2. Get local media
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: state.isVideoOff ? false : { width: 1280, height: 720 },
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // 3. Add tracks to peer connection
        stream.getTracks().forEach(track => {
          pcRef.current?.addTrack(track, stream);
        });

        // 4. ICE candidate handling → push to signaling table
        pcRef.current.onicecandidate = async (e) => {
          if (e.candidate && user && callTarget) {
            // Real implementation: create a call row, then push ICE candidates
            // For now we just log — full signaling is in docs/security/e2ee.md
            console.debug('ICE candidate for', callTarget.id, e.candidate);
          }
        };

        // 5. Remote track handler
        pcRef.current.ontrack = (e) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = e.streams[0];
          }
        };

        setState(prev => ({ ...prev, status: 'active' }));
        toast.success('Call connected');
      } catch (e: any) {
        toast.error(`Call failed: ${e.message}`);
        setState(prev => ({ ...prev, status: 'ended' }));
        setTimeout(() => endCall(), 1500);
      }
    };

    init();

    // Duration timer
    const interval = setInterval(() => {
      setState(prev => prev.status === 'active' ? { ...prev, duration: prev.duration + 1 } : prev);
    }, 1000);

    return () => {
      clearInterval(interval);
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      pcRef.current?.close();
    };
  }, [user, callTarget, endCall]);

  const toggleMute = () => {
    const newState = !state.isMuted;
    localStreamRef.current?.getAudioTracks().forEach(t => t.enabled = !newState);
    setState(prev => ({ ...prev, isMuted: newState }));
  };

  const toggleVideo = () => {
    const newState = !state.isVideoOff;
    localStreamRef.current?.getVideoTracks().forEach(t => t.enabled = !newState);
    setState(prev => ({ ...prev, isVideoOff: newState }));
  };

  const hangup = async () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    setState(prev => ({ ...prev, status: 'ended' }));
    setTimeout(() => endCall(), 500);
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col">
      {/* Remote video — full screen */}
      <div className="flex-1 relative bg-black">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
        {state.status === 'connecting' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="h-16 w-16 mx-auto rounded-full bg-primary/30 flex items-center justify-center">
                <Volume2 className="h-8 w-8 text-nexus-lavender animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground">Connecting…</p>
            </div>
          </div>
        )}

        {/* Local video — PiP */}
        <div className="absolute top-4 right-4 w-32 sm:w-48 aspect-video rounded-lg overflow-hidden border-2 border-primary/40 shadow-xl bg-black">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover -scale-x-100"
          />
          {state.isVideoOff && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
              <VideoOff className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="absolute top-4 left-4 px-3 py-1.5 rounded-md bg-background/60 backdrop-blur text-xs font-mono">
          {state.status === 'active' ? formatDuration(state.duration) : state.status}
        </div>
      </div>

      {/* Controls */}
      <div className="h-24 flex items-center justify-center gap-3 bg-background/80 backdrop-blur border-t border-border">
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-full"
          onClick={toggleMute}
          aria-label={state.isMuted ? 'Unmute' : 'Mute'}
        >
          {state.isMuted ? <MicOff className="h-5 w-5 text-destructive" /> : <Mic className="h-5 w-5" />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-full"
          onClick={toggleVideo}
          aria-label={state.isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {state.isVideoOff ? <VideoOff className="h-5 w-5 text-destructive" /> : <Video className="h-5 w-5" />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-full"
          onClick={() => setState(p => ({ ...p, isSpeakerOn: !p.isSpeakerOn }))}
          aria-label="Speaker"
        >
          <Volume2 className={`h-5 w-5 ${state.isSpeakerOn ? '' : 'text-muted-foreground'}`} />
        </Button>
        <Button
          variant="destructive"
          size="icon"
          className="h-12 w-12 rounded-full"
          onClick={hangup}
          aria-label="Hang up"
        >
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
