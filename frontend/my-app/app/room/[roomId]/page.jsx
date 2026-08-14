"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { io } from "socket.io-client";
import { Mic, MicOff, Video, VideoOff, StopCircle, ShieldAlert } from "lucide-react";

const ICE_SERVERS = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = params.roomId;
  const isHost = searchParams.get("host") === "true";

  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  
  const videoRef = useRef(null);

  useEffect(() => {
    socketRef.current = io();

    socketRef.current.emit("join-room", roomId, socketRef.current.id);

    socketRef.current.on("user-connected", async (userId) => {
      if (isHost) {
        await initiateCall(userId);
      }
    });

    socketRef.current.on("offer", async ({ offer, sender }) => {
      if (!isHost) {
        await handleReceiveOffer(offer, sender);
      }
    });

    socketRef.current.on("answer", async ({ answer }) => {
      if (peerRef.current) {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socketRef.current.on("ice-candidate", async ({ candidate }) => {
      if (peerRef.current && candidate) {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    // Handle Remote Control Commands on Host side
    if (isHost) {
      socketRef.current.on("remote-control-event", (eventData) => {
        // Execute simulated or direct window operations depending on context
        console.log("Remote control instruction received:", eventData);
      });
    }

    if (isHost) {
      startScreenShare();
    }

    return () => {
      socketRef.current.disconnect();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [roomId, isHost]);

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true });
      localStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      stream.getVideoTracks()[0].onended = () => {
        stopSharing();
      };
    } catch (err) {
      console.error("Error capturing screen:", err);
    }
  };

  const createPeerConnection = (targetId) => {
    const peer = new RTCPeerConnection(ICE_SERVERS);
    peerRef.current = peer;

    if (isHost && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, localStreamRef.current);
      });
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("ice-candidate", { candidate: event.candidate, target: targetId, roomId });
      }
    };

    peer.ontrack = (event) => {
      if (!isHost && videoRef.current) {
        videoRef.current.srcObject = event.streams[0];
        setConnected(true);
      }
    };

    return peer;
  };

  const initiateCall = async (userId) => {
    const peer = createPeerConnection(userId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socketRef.current.emit("offer", { offer, target: userId, sender: socketRef.current.id });
  };

  const handleReceiveOffer = async (offer, senderId) => {
    const peer = createPeerConnection(senderId);
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socketRef.current.emit("answer", { answer, target: senderId });
    setConnected(true);
  };

  const stopSharing = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    window.location.href = "/";
  };

  // Controller clicking mapping handler
  const handleVideoClick = (e) => {
    if (isHost) return; // Host doesn't control local screen via this view
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width; // Percentage scale
    const y = (e.clientY - rect.top) / rect.height;

    socketRef.current.emit("remote-control-event", {
      roomId,
      event: { type: "click", x, y }
    });
  };

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col justify-between overflow-hidden text-slate-100">
      {/* Top Bar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/40 backdrop-blur px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${connected || isHost ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
          <span className="font-semibold tracking-wide text-sm">
            Session ID: <span className="text-indigo-400 font-mono">{roomId}</span>
          </span>
        </div>
        <div className="text-xs px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
          Role: <strong className="text-white">{isHost ? "Host (Sharing)" : "Viewer (Controlling)"}</strong>
        </div>
      </header>

      {/* Main Stream Window */}
      <div className="flex-1 relative flex items-center justify-center p-4">
        <div className="w-full h-full max-w-7xl max-h-[80vh] bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl relative flex items-center justify-center">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            onClick={handleVideoClick}
            className="w-full h-full object-contain cursor-crosshair"
          />
          {!connected && !isHost && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Connecting to secure host stream...</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <footer className="h-20 border-t border-slate-800 bg-slate-900/40 backdrop-blur px-6 flex items-center justify-center gap-4">
        {isHost && (
          <button onClick={stopSharing} className="bg-rose-600 hover:bg-rose-500 px-5 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all shadow-lg shadow-rose-600/20">
            <StopCircle className="w-4 h-4" /> Stop Sharing
          </button>
        )}
      </footer>
    </div>
  );
}