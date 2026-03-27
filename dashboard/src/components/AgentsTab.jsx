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
  Zap,
  Calendar
} from 'lucide-react';

const AGENTS = {
  'inventory': { 
    name: 'Stock Watcher', 
    role: 'Checks all 1,200 products every 60 seconds and alerts when anything is running low',
    icon: Package,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    gradient: 'from-amber-500/20 to-orange-500/5'
  },
  'procurement': { 
    name: 'Deal Finder', 
    role: 'Scours the market for the best prices and identifies the most reliable suppliers for you',
    icon: Search,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    gradient: 'from-blue-500/20 to-cyan-500/5'
  },
  'negotiation': { 
    name: 'Supplier Talker', 
    role: 'Handles all the WhatsApp back-and-forth with suppliers to lock in the deals you want',
    icon: MessageCircle,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    gradient: 'from-green-500/20 to-emerald-500/5'
  },
  'customer': { 
    name: 'Offer Sender', 
    role: 'Finds your best customers and sends them personalized special offers they actually like',
    icon: Megaphone,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    gradient: 'from-purple-500/20 to-pink-500/5'
  },
  'analytics': { 
    name: 'Business Analyst', 
    role: 'Analyzes your sales and orders to give you clear advice on how to grow your supermart',
    icon: BarChart3,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    gradient: 'from-blue-400/20 to-indigo-500/5'
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
      alert("✅ Demo triggered! Go to Dashboard to see it starting.");
    } catch (e) {
      console.error('Failed to trigger demo:', e);
    }
    setIsTriggering(false);
  };

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-black text-white/40 uppercase tracking-widest">Your RetailOS Team</h2>
        <div className="text-[10px] font-bold text-white/20 uppercase tracking-tighter">
          {Object.keys(AGENTS).length} Active Agents
        </div>
      </div>

      {/* Agent Grid: 1 col mobile, 2 cols desktop, 3 cols xl */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
        {Object.entries(AGENTS).map(([key, config], i) => {
          const status = agents.find(a => a.name === key)?.status || 'stopped';
          const isRunning = status === 'running';

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`p-5 lg:p-6 rounded-3xl bg-zinc-900/50 border border-white/5 relative overflow-hidden group hover:border-white/10 transition-all`}
            >
              {/* Subtle gradient overlay */}
              <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

              <div className="flex gap-4 items-start relative z-10">
                <div className={`w-12 h-12 lg:w-14 lg:h-14 rounded-2xl ${config.bg} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                  <config.icon size={24} className={config.color} />
                </div>
                
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] lg:text-[16px] font-black leading-none">{config.name}</h3>
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/40 border border-white/5`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-white/20'}`} />
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/40">
                        {isRunning ? '✅ Working' : '⏸️ Paused'}
                      </span>
                    </div>
                  </div>
                  
                  <p className="text-[11px] lg:text-[12px] font-medium text-white/50 leading-tight">
                    {config.role}
                  </p>
                </div>
              </div>

              {/* Stats Footer */}
              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-4">
                  <div className="space-y-0.5">
                    <div className="text-[8px] font-black text-white/20 uppercase tracking-widest">Today's Work</div>
                    <div className="text-[11px] font-black flex items-center gap-1">
                      <Zap size={10} className="text-blue-400" />
                      {key === 'inventory' ? '720 checks' : 
                       key === 'procurement' ? '8 suppliers found' :
                       key === 'negotiation' ? '4 deals closed' : 
                       key === 'customer' ? '23 offers sent' :
                       key === 'analytics' ? '3 insights' :
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
                  className={`p-2.5 rounded-xl border transition-all ${
                    isRunning 
                      ? 'border-white/5 hover:bg-white/5 text-white/40 hover:text-white' 
                      : 'border-green-500 text-green-500 hover:bg-green-500/10'
                  }`}
                >
                  {isRunning ? <Pause size={14} /> : <Play size={14} />}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Demo Trigger */}
      <div className="pt-6 lg:pt-10 pb-4 flex flex-col items-center gap-4">
        <div className="text-[10px] font-black text-white/10 uppercase tracking-[0.3em] italic">Advanced Control</div>
        <button
          onClick={triggerDemo}
          disabled={isTriggering}
          className="px-6 py-3 rounded-2xl bg-white/5 border border-white/5 text-white/20 hover:text-white hover:border-white/10 hover:bg-white/10 transition-all font-black text-[10px] uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
        >
          {isTriggering ? '🚀 Launching...' : '🚀 Launch Low Stock Demo'}
        </button>
      </div>
    </div>
  );
}
