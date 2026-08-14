"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { io } from "socket.io-client";
import { StopCircle, Monitor } from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://remote-control-llza.onrender.com";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" }
  ],
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
    const socket = io(BACKEND_URL);
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("> Connected to signaling backend:", socket.id);
      
      socket.emit("join-room", roomId, socket.id);

      if (!isHost) {
        socket.emit("request-stream", { roomId });
      }
    });

    if (isHost) {
      startScreenShare();
    }

    socket.on("request-stream", async (data) => {
      if (isHost && data?.requesterId) {
        console.log(`> Viewer [${data.requesterId}] requested stream. Sending offer...`);
        await initiateCall(data.requesterId);
      }
    });

    socket.on("user-connected", async (data) => {
      if (isHost) {
        const targetId = typeof data === "object" ? (data.socketId || data.userId) : data;
        if (targetId && targetId !== socket.id) {
          console.log(`> User connected [${targetId}]. Initiating WebRTC call...`);
          await initiateCall(targetId);
        }
      }
    });

    socket.on("offer", async ({ offer, sender }) => {
      if (!isHost) {
        console.log(`> Received offer from host [${sender}]`);
        await handleReceiveOffer(offer, sender);
      }
    });

    socket.on("answer", async ({ answer }) => {
      if (peerRef.current) {
        console.log("> Received WebRTC answer from viewer");
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      if (peerRef.current && candidate) {
        try {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Error adding ICE Candidate:", err);
        }
      }
    });

    if (isHost) {
      socket.on("remote-control-event", (eventData) => {
        console.log("Remote control instruction received:", eventData);
      });
    }

    return () => {
      socket.disconnect();
      if (peerRef.current) {
        peerRef.current.close();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [roomId, isHost]);

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: true
      });
      
      localStreamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      stream.getVideoTracks()[0].onended = () => {
        stopSharing();
      };
    } catch (err) {
      console.error("Error capturing screen:", err);
    }
  };

  const createPeerConnection = (targetId) => {
    if (peerRef.current) {
      peerRef.current.close();
    }

    const peer = new RTCPeerConnection(ICE_SERVERS);
    peerRef.current = peer;

    if (isHost && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, localStreamRef.current);
      });
    }

    peer.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("ice-candidate", {
          candidate: event.candidate,
          target: targetId,
          roomId
        });
      }
    };

    peer.ontrack = (event) => {
      console.log("> Stream track received on viewer side");
      if (!isHost && videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        videoRef.current.play().catch((err) => console.error("Autoplay play() error:", err));
        setConnected(true);
      }
    };

    return peer;
  };

  const initiateCall = async (targetId) => {
    const peer = createPeerConnection(targetId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    if (socketRef.current) {
      socketRef.current.emit("offer", {
        offer,
        target: targetId,
        roomId
      });
    }
  };

  const handleReceiveOffer = async (offer, senderId) => {
    const peer = createPeerConnection(senderId);
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    if (socketRef.current) {
      socketRef.current.emit("answer", {
        answer,
        target: senderId,
        roomId
      });
    }
    setConnected(true);
  };

  const stopSharing = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    window.location.href = "/";
  };

  const handleVideoClick = (e) => {
    if (isHost || !socketRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
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
            muted 
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
        {isHost ? (
          <button onClick={stopSharing} className="bg-rose-600 hover:bg-rose-500 px-5 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all shadow-lg shadow-rose-600/20">
            <StopCircle className="w-4 h-4" /> Stop Sharing
          </button>
        ) : (
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Monitor className="w-4 h-4 text-emerald-400" /> Remote interaction active. Click screen to interact.
          </div>
        )}
      </footer>
    </div>
  );
}
