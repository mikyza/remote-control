"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Share2, ShieldCheck, ArrowRight } from "lucide-react";

export default function Home() {
  const [roomIdInput, setRoomIdInput] = useState("");
  const [hostName, setHostName] = useState("");
  const router = useRouter();

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostName) return;
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
      
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
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
              placeholder="Your Name / Device Label" 
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
        <div className="bg-slate-900/60 border border-slate-800 p-8 rounded-2xl backdrop-blur-xl flex flex-col justify-between shadow-2xl">
          <div>
            <div className="w-12 h-12 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center mb-6">
              <Monitor className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Control a Device</h2>
            <p className="text-slate-400 text-sm mt-2">Connect instantly using a secure session token to view and control remote devices.</p>
          </div>
          <form onSubmit={joinRoom} className="mt-8 space-y-4">
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
        </div>
      </div>
    </main>
  );
}