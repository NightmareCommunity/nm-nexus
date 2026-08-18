'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useUIStore } from '@/lib/stores/ui-store';
import { createClient } from '@/lib/supabase/client';
import { Mic, MicOff, Video, VideoOff, Phone, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type CallStatus = 'requesting' | 'ringing' | 'connecting' | 'active' | 'ended' | 'failed';

interface CallSignal {
  id: string;
  signal_type: 'offer' | 'answer' | 'ice' | 'hangup' | 'reject';
  payload: any;
  from_user: string;
  to_user: string;
  created_at: string;
}

export function CallOverlay() {
  const { user } = useAuthStore();
  const { callOverlayOpen, callType, callTarget, endCall } = useUIStore();
  const [status, setStatus] = useState<CallStatus>('requesting');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const supabaseRef = useRef(createClient());
  const channelRef = useRef<ReturnType<typeof supabaseRef.current.channel> | null>(null);
  const incomingSignalsRef = useRef<CallSignal[]>([]);
  const callerRoleRef = useRef<'caller' | 'callee'>('caller');
  const cleanupRef = useRef<(() => void) | null>(null);

  // STUN/TURN config
  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: process.env.NEXT_PUBLIC_STUN_URLS || 'stun:stun.l.google.com:19302' },
    ],
  };

  // Duration timer
  useEffect(() => {
    if (status !== 'active') return;
    const i = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(i);
  }, [status]);

  // Main call setup effect
  useEffect(() => {
    if (!callOverlayOpen || !user || !callTarget) return;

    let cancelled = false;
    const supabase = supabaseRef.current;

    const setupCall = async () => {
      try {
        // 1. Get local media (mic + camera if video)
        const constraints: MediaStreamConstraints = {
          audio: true,
          video: callType === 'video' ? { facingMode: 'user', width: 1280, height: 720 } : false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setLocalStream(stream);
        if (localVideoRef.current && callType === 'video') {
          localVideoRef.current.srcObject = stream;
        }

        // 2. Create the call record (caller side) — only the caller creates the row
        // For a 1:1 DM call, we treat the user who clicked "call" as the caller.
        // We try to create a row in `calls` (insert will fail if there's a uniqueness issue,
        // but we use a generated UUID so it won't).
        const isCaller = callerRoleRef.current === 'caller';
        let activeCallId: string | null = null;

        if (isCaller) {
          // Create the call row + insert a DM-less conversation-less call record.
          // We attach the call to a DM conversation between the two users if one exists.
          const { data: myConvs } = await supabase
            .from('conversation_members')
            .select('conversation_id')
            .eq('user_id', user.id);
          const convIds = (myConvs || []).map((m) => m.conversation_id);
          let conversationId: string | null = null;
          if (convIds.length > 0) {
            const { data: theirConvs } = await supabase
              .from('conversation_members')
              .select('conversation_id')
              .eq('user_id', callTarget.id)
              .in('conversation_id', convIds);
            if (theirConvs && theirConvs.length > 0) {
              conversationId = theirConvs[0].conversation_id;
            }
          }

          const { data: callRow, error: callErr } = await supabase
            .from('calls')
            .insert({
              conversation_id: conversationId,
              initiated_by: user.id,
              type: callType === 'video' ? 'video' : 'voice',
              status: 'ringing',
            })
            .select()
            .single();
          if (callErr) throw new Error(`Failed to create call: ${callErr.message}`);
          activeCallId = callRow.id;
          setCallId(activeCallId);

          // Insert myself as participant
          await supabase.from('call_participants').insert({
            call_id: activeCallId,
            user_id: user.id,
          });

          setStatus('ringing');
        }

        // 3. Set up the peer connection
        const pc = new RTCPeerConnection(rtcConfig);
        pcRef.current = pc;

        // Add local tracks
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Receive remote tracks
        const remote = new MediaStream();
        setRemoteStream(remote);
        if (remoteVideoRef.current && callType === 'video') {
          remoteVideoRef.current.srcObject = remote;
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remote;
        }
        pc.ontrack = (e) => {
          e.streams[0].getTracks().forEach((t) => remote.addTrack(t));
        };

        // ICE candidates → send via call_signaling
        pc.onicecandidate = async (e) => {
          if (e.candidate && activeCallId) {
            await supabase.from('call_signaling').insert({
              call_id: activeCallId,
              from_user: user.id,
              to_user: callTarget.id,
              signal_type: 'ice',
              payload: { candidate: e.candidate.toJSON() },
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            setStatus('active');
            toast.success('Call connected');
          } else if (pc.connectionState === 'disconnected') {
            toast.warning('Connection unstable — reconnecting…');
          } else if (pc.connectionState === 'failed') {
            setStatus('failed');
            toast.error('Call connection failed');
          }
        };

        // 4. Subscribe to incoming signals from the other party
        const channel = supabase
          .channel(`call-${user.id}-${callTarget.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'call_signaling',
              filter: `to_user=eq.${user.id}`,
            },
            (payload) => {
              const sig = payload.new as CallSignal;
              if (sig.from_user !== callTarget.id) return;
              handleSignal(sig, pc, activeCallId, user.id, callTarget.id);
            }
          )
          .subscribe();

        channelRef.current = channel;

        // 5. If caller, send the offer
        if (isCaller && activeCallId) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await supabase.from('call_signaling').insert({
            call_id: activeCallId,
            from_user: user.id,
            to_user: callTarget.id,
            signal_type: 'offer',
            payload: { sdp: offer.toJSON() },
          });
        }
      } catch (e: any) {
        console.error('Call setup failed', e);
        toast.error(e?.message || 'Could not start call');
        setStatus('failed');
      }
    };

    setupCall();

    return () => {
      cancelled = true;
      cleanupCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callOverlayOpen, user, callTarget, callType]);

  async function handleSignal(
    sig: CallSignal,
    pc: RTCPeerConnection,
    activeCallId: string | null,
    myId: string,
    theirId: string
  ) {
    const supabase = supabaseRef.current;
    try {
      if (sig.signal_type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sig.payload.sdp));
        // Create and send answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        // Use the call_id from the incoming signal's call (it has the call_id)
        if (sig.call_id) {
          await supabase.from('call_signaling').insert({
            call_id: sig.call_id,
            from_user: myId,
            to_user: theirId,
            signal_type: 'answer',
            payload: { sdp: answer.toJSON() },
          });
        }
      } else if (sig.signal_type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sig.payload.sdp));
      } else if (sig.signal_type === 'ice') {
        if (sig.payload.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(sig.payload.candidate));
          } catch (e) {
            console.warn('addIceCandidate failed', e);
          }
        }
      } else if (sig.signal_type === 'hangup' || sig.signal_type === 'reject') {
        toast.info(sig.signal_type === 'reject' ? 'Call rejected' : 'Other party ended the call');
        endCall();
      }
    } catch (e) {
      console.error('signal handling failed', e);
    }
  }

  function cleanupCall() {
    try {
      if (channelRef.current) {
        supabaseRef.current.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    } catch (e) {}
    try {
      if (pcRef.current) {
        pcRef.current.getSenders().forEach((s) => {
          try { s.track?.stop(); } catch (e) {}
        });
        pcRef.current.close();
        pcRef.current = null;
      }
    } catch (e) {}
    try {
      localStream?.getTracks().forEach((t) => t.stop());
      remoteStream?.getTracks().forEach((t) => t.stop());
    } catch (e) {}

    // Mark call ended + signal hangup
    if (callId && user && callTarget) {
      const supabase = supabaseRef.current;
      supabase
        .from('calls')
        .update({
          status: status === 'active' ? 'ended' : status === 'failed' ? 'failed' : 'missed',
          ended_at: new Date().toISOString(),
        })
        .eq('id', callId)
        .then(() => {});
      supabase
        .from('call_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('call_id', callId)
        .eq('user_id', user.id)
        .then(() => {});
      supabase
        .from('call_signaling')
        .insert({
          call_id: callId,
          from_user: user.id,
          to_user: callTarget.id,
          signal_type: 'hangup',
          payload: {},
        })
        .then(() => {});
    }
  }

  function toggleMute() {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setMuted((m) => !m);
  }

  function toggleVideo() {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setVideoOff((v) => !v);
  }

  function toggleDeafen() {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !deafened;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !deafened;
    }
    setDeafened((d) => !d);
  }

  function handleEndCall() {
    cleanupCall();
    endCall();
  }

  if (!callOverlayOpen || !callTarget) return null;

  const fmtDuration = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center gap-6">
      {/* Remote video / avatar */}
      <div className="relative w-full max-w-3xl aspect-video bg-black/50 rounded-xl overflow-hidden flex items-center justify-center">
        {callType === 'video' && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={cn('h-full w-full object-cover', videoOff && 'hidden')}
          />
        )}
        {callType !== 'video' || videoOff ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-24 w-24 rounded-full bg-nexus-violet/30 flex items-center justify-center">
              {callTarget.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={callTarget.avatar} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-white">
                  {callTarget.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="text-lg font-semibold text-white">{callTarget.name}</div>
            <div className="text-sm text-muted-foreground">
              {status === 'requesting' && 'Calling…'}
              {status === 'ringing' && 'Ringing…'}
              {status === 'connecting' && 'Connecting…'}
              {status === 'active' && fmtDuration}
              {status === 'ended' && 'Call ended'}
              {status === 'failed' && 'Call failed'}
            </div>
          </div>
        ) : null}
        <audio ref={remoteAudioRef} autoPlay />
      </div>

      {/* Local PiP video */}
      {callType === 'video' && (
        <div className="absolute bottom-32 right-8 w-48 aspect-video bg-black/80 rounded-lg overflow-hidden border border-white/10">
          <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMute}
          className={cn(
            'h-12 w-12 rounded-full flex items-center justify-center transition-colors',
            muted ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
          )}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>

        {callType === 'video' && (
          <button
            onClick={toggleVideo}
            className={cn(
              'h-12 w-12 rounded-full flex items-center justify-center transition-colors',
              videoOff ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
            )}
            title={videoOff ? 'Turn on camera' : 'Turn off camera'}
          >
            {videoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </button>
        )}

        <button
          onClick={toggleDeafen}
          className={cn(
            'h-12 w-12 rounded-full flex items-center justify-center transition-colors',
            deafened ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
          )}
          title={deafened ? 'Undeafen' : 'Deafen'}
        >
          {deafened ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>

        <button
          onClick={handleEndCall}
          className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center"
          title="End call"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>

      <p className="text-xs text-white/50">
        NM NEXUS · {callType === 'video' ? 'Video call' : 'Voice call'} · End-to-end encrypted via DTLS-SRTP
      </p>
    </div>
  );
}
