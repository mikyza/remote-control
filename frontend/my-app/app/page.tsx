"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Share2, ShieldCheck, ArrowRight, Wifi, Cpu } from "lucide-react";
import { io, Socket } from "socket.io-client";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://remote-control-llza.onrender.com";

interface Device {
  socketId: string;
  label: string;
  ip: string;
  mac: string;
  status: string;
}

export default function Home() {
  const [roomIdInput, setRoomIdInput] = useState("");
  const [hostName, setHostName] = useState("");
  const [onlineDevices, setOnlineDevices] = useState<Device[]>([]);
  
  // State to hold this specific device's persistent info
  const [myDeviceInfo, setMyDeviceInfo] = useState<{ label: string; mac: string; ip: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    // 1. Check if this device has connected before
    let savedDevice = localStorage.getItem("remote-device-identity");
    let currentDevice;

    if (savedDevice) {
      currentDevice = JSON.parse(savedDevice);
    } else {
      // 2. First time connecting: Generate a persistent identity and save it
      // In a real browser, we use a UUID as a pseudo-MAC. In Electron, you'd fetch the real one here.
      currentDevice = {
        label: `Desktop-${Math.floor(Math.random() * 10000)}`,
        mac: `Browser-Env-${Math.random().toString(36).substring(2, 10)}`, 
        ip: "Determined by Server", 
      };
      localStorage.setItem("remote-device-identity", JSON.stringify(currentDevice));
    }
    
    setMyDeviceInfo(currentDevice);
    setHostName(currentDevice.label); // Auto-fill the broadcast name

    // 3. Connect to the server, passing our persistent identity so the server knows who we are
    const socket: Socket = io(BACKEND_URL, {
      query: {
        label: currentDevice.label,
        mac: currentDevice.mac
      }
    });

    socket.on("connect", () => {
      console.log("Connected to signaling server");
    });

    // 4. Listen for the broadcasted list of devices
    socket.on("online-devices", (devices: Device[]) => {
      // Filter out our own device using our MAC/Identity so we don't connect to ourselves
      const otherDevices = devices.filter((d) => d.mac !== currentDevice.mac);
      setOnlineDevices(otherDevices);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostName) return;
    
    // Update local storage if the user changes their device label
    if (myDeviceInfo) {
      const updatedInfo = { ...myDeviceInfo, label: hostName };
      localStorage.setItem("remote-device-identity", JSON.stringify(updatedInfo));
    }

    const generatedId = Math.random().toString(36).substring(2, 9);
    router.push(`/room/${generatedId}?host=true&name=${encodeURIComponent(hostName)}`);
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomIdInput) return;
    router.push(`/room/${roomIdInput}?host=false`);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 selection:bg-indigo-500 selection:text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.08)_0,transparent_100%)] pointer-events-none" />
      
      {/* Header showing current device identity */}
      {myDeviceInfo && (
        <div className="absolute top-6 left-6 z-20 flex items-center gap-3 bg-slate-900/80 border border-slate-800 px-4 py-2 rounded-lg backdrop-blur-md">
          <Cpu className="w-5 h-5 text-indigo-400" />
          <div className="flex flex-col">
            <span className="text-xs text-slate-400">This Device Label</span>
            <span className="text-sm font-semibold text-slate-200">{myDeviceInfo.label}</span>
          </div>
        </div>
      )}

      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
        {/* Host Section */}
        <div className="bg-slate-900/60 border border-slate-800 p-8 rounded-2xl backdrop-blur-xl flex flex-col justify-between shadow-2xl shadow-indigo-500/5">
          <div>
            <div className="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mb-6">
              <Share2 className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Share Your Screen</h2>
            <p className="text-slate-400 text-sm mt-2">Broadcast your desktop securely over the web and permit remote interaction effortlessly.</p>
          </div>
          <form onSubmit={createRoom} className="mt-8 space-y-4">
            <input 
              type="text" 
              placeholder="Your Device Label" 
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              required
            />
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20">
              Start Broadcasting <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Control Section */}
        <div className="bg-slate-900/60 border border-slate-800 p-8 rounded-2xl backdrop-blur-xl flex flex-col shadow-2xl">
          <div>
            <div className="w-12 h-12 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center mb-6">
              <Monitor className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Control a Device</h2>
            <p className="text-slate-400 text-sm mt-2">Connect instantly using a secure session token or select an active device below.</p>
          </div>
          
          <form onSubmit={joinRoom} className="mt-6 space-y-4">
            <input 
              type="text" 
              placeholder="Enter Session / Room ID" 
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              required
            />
            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20">
              Connect & Control <ShieldCheck className="w-4 h-4" />
            </button>
          </form>

          {/* Online Devices List */}
          <div className="mt-8 pt-6 border-t border-slate-800">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
              <Wifi className="w-4 h-4 text-emerald-500" /> 
              Online Devices ({onlineDevices.length})
            </h3>
            
            <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {onlineDevices.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No other devices currently online.</p>
              ) : (
                onlineDevices.map((device) => (
                  <div 
                    key={device.socketId}
                    onClick={() => setRoomIdInput(device.socketId)}
                    className="flex flex-col p-3 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-emerald-500/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-200">{device.label}</span>
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Online
                      </span>
                    </div>
                    {/* Displaying IP and MAC */}
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                      <span>IP: {device.ip || "Unknown"}</span>
                      <span>MAC: {device.mac || "Unknown"}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
