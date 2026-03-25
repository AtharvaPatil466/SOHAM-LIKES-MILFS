import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Package, 
  Search, 
  MessageCircle, 
  Megaphone, 
  BarChart3,
  Settings,
  Pause,
  Play,
  CheckCircle2,
  AlertCircle,
  Zap
} from 'lucide-react';

const AGENTS = {
  'inventory': { 
    name: 'Stock Watcher', 
    role: 'Checks all 1,200 products every 60 seconds and alerts when anything is running low',
    icon: Package,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10'
  },
  'procurement': { 
    name: 'Deal Finder', 
    role: 'Scours the market for the best prices and identifies the most reliable suppliers for you',
    icon: Search,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10'
  },
  'negotiation': { 
    name: 'Supplier Talker', 
    role: 'Handles all the WhatsApp back-and-forth with suppliers to lock in the deals you want',
    icon: MessageCircle,
    color: 'text-green-500',
    bg: 'bg-green-500/10'
  },
  'customer': { 
    name: 'Offer Sender', 
    role: 'Finds your best customers and sends them personalized special offers they actually like',
    icon: Megaphone,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10'
  },
  'analytics': { 
    name: 'Business Analyst', 
    role: 'Analyzes your sales and orders to give you clear advice on how to grow your supermart',
    icon: BarChart3,
    color: 'text-primary',
    bg: 'bg-primary/10'
  },
};

export default function AgentsTab({ agents, onRefresh }) {
  const [isTriggering, setIsTriggering] = useState(false);

  const toggleAgent = async (name, currentState) => {
    const endpoint = currentState === 'running' ? 'pause' : 'resume';
    try {
      await fetch(`/api/skills/${name}/${endpoint}`, { method: 'POST' });
      onRefresh();
    } catch (e) {
      console.error('Failed to toggle agent:', e);
    }
  };

  const triggerDemo = async () => {
    setIsTriggering(true);
    try {
      await fetch('/api/demo/trigger-flow', { method: 'POST' });
      alert("✅ Demo triggered! Go to HOME to see it starting.");
    } catch (e) {
      console.error('Failed to trigger demo:', e);
    }
    setIsTriggering(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-black text-white/40 uppercase tracking-widest">Your RetailOS Team</h2>
        <div className="text-[10px] font-bold text-white/20 uppercase tracking-tighter">5 Active Agents</div>
      </div>

      <div className="space-y-4">
        {Object.entries(AGENTS).map(([key, config], i) => {
          const status = agents.find(a => a.name === key)?.status || 'stopped';
          const isRunning = status === 'running';

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="p-5 rounded-3xl bg-zinc-900/50 border border-white/5 relative overflow-hidden group"
            >
              <div className="flex gap-4 items-start relative z-10">
                <div className={`w-14 h-14 rounded-2xl ${config.bg} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                  <config.icon size={26} className={config.color} />
                </div>
                
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[16px] font-black leading-none">{config.name}</h3>
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/40 border border-white/5`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-success animate-pulse' : 'bg-white/20'}`} />
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/40">
                        {isRunning ? '✅ Working' : '⏸️ Paused'}
                      </span>
                    </div>
                  </div>
                  
                  <p className="text-[12px] font-medium text-white/60 leading-tight">
                    {config.role}
                  </p>
                </div>
              </div>

              {/* Stats Footer */}
              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="space-y-0.5">
                    <div className="text-[8px] font-black text-white/20 uppercase tracking-widest">Today's Work</div>
                    <div className="text-[11px] font-black flex items-center gap-1">
                      <Zap size={10} className="text-primary" />
                      {key === 'inventory' ? '720 checks' : 
                       key === 'procurement' ? '8 suppliers found' :
                       key === 'negotiation' ? '4 deals closed' : 
                       'No alerts today'}
                    </div>
                  </div>
                  <div className="w-px h-6 bg-white/5" />
                  <div className="space-y-0.5">
                    <div className="text-[8px] font-black text-white/20 uppercase tracking-widest">Efficiency</div>
                    <div className="text-[11px] font-black text-white/60">98.2%</div>
                  </div>
                </div>

                <button 
                  onClick={() => toggleAgent(key, status)}
                  className={`p-2 rounded-xl border transition-all ${
                    isRunning 
                      ? 'border-white/5 hover:bg-white/5 text-white/40 hover:text-white' 
                      : 'border-success text-success hover:bg-success/10'
                  }`}
                >
                  {isRunning ? <Pause size={14} /> : <Play size={14} />}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Hidden Demo Trigger */}
      <div className="pt-10 pb-4 flex flex-col items-center gap-4">
        <div className="text-[10px] font-black text-white/10 uppercase tracking-[0.3em] font-black italic">Advanced Control</div>
        <button
          onClick={triggerDemo}
          disabled={isTriggering}
          className="px-6 py-3 rounded-2xl bg-white/5 border border-white/5 text-white/20 hover:text-white hover:border-white/10 transition-all font-black text-[10px] uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
        >
          {isTriggering ? '🚀 Launching...' : '🚀 Launch Low Stock Demo'}
        </button>
      </div>
    </div>
  );
}
