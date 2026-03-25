import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShoppingCart, 
  Megaphone, 
  MessageCircle, 
  Search, 
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  BrainCircuit,
  Calendar
} from 'lucide-react';

const CATEGORIES = {
  'inventory': { label: 'Stock Checks', icon: Search, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  'procurement': { label: 'Supplier Finder', icon: ShoppingCart, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  'negotiation': { label: 'Supplier Talks', icon: MessageCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
  'customer': { label: 'Offers Sent', icon: Megaphone, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  'orchestrator': { label: 'System', icon: BrainCircuit, color: 'text-white/40', bg: 'bg-white/5' },
};

export default function WhatHappenedTab({ logs }) {
  const [filter, setFilter] = useState('All');
  const [expandedLogs, setExpandedLogs] = useState({});

  const toggleLog = (id) => {
    setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredLogs = logs.filter(log => {
    if (filter === 'All') return true;
    const cat = CATEGORIES[log.skill]?.label;
    return cat === filter;
  });

  return (
    <div className="space-y-6">
      <h2 className="text-xs font-black text-white/40 uppercase tracking-widest px-1">Everything RetailOS did</h2>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {['All', 'Stock Checks', 'Supplier Finder', 'Supplier Talks', 'Offers Sent'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap border transition-all ${
              filter === f 
                ? 'bg-primary border-primary text-white shadow-lg shadow-blue-600/20' 
                : 'bg-zinc-900 border-white/5 text-white/40 hover:text-white/60'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {filteredLogs.map((log, i) => {
          const category = CATEGORIES[log.skill] || CATEGORIES.orchestrator;
          const Icon = category.icon;
          const isExpanded = expandedLogs[log.id];

          return (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="group"
            >
              <div className="relative rounded-3xl bg-zinc-900/50 border border-white/5 overflow-hidden transition-all hover:border-white/10">
                <div className="p-4 flex gap-4">
                  <div className={`w-12 h-12 rounded-2xl ${category.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={20} className={category.color} />
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-black uppercase tracking-widest ${category.color}`}>
                        {category.label}
                      </span>
                      <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest flex items-center gap-1">
                        <Calendar size={10} />
                        {new Date(log.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    
                    <h3 className="text-[14px] font-black leading-tight text-white group-hover:text-primary transition-colors">
                      {log.decision}
                    </h3>
                    
                    <p className="text-[12px] font-medium text-white/40 leading-snug">
                      {log.reasoning}
                    </p>

                    <button 
                      onClick={() => toggleLog(log.id)}
                      className="mt-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-colors"
                    >
                      <BrainCircuit size={12} />
                      <span>{isExpanded ? 'Hide my thinking' : 'Wait, how did you decide this?'}</span>
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="bg-black/40 border-t border-white/5"
                    >
                      <div className="p-5 space-y-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-primary">Here's exactly how I thought about this:</div>
                        <div className="text-[12px] font-medium leading-relaxed text-white/60 bg-white/5 p-4 rounded-2xl border border-white/5 italic">
                          "{log.reasoning || "I checked the current data and historical patterns to ensure the best possible outcome for your business."}"
                        </div>
                        {log.outcome && (
                          <div className="space-y-2">
                             <div className="text-[10px] font-black uppercase tracking-widest text-white/20">Final Result:</div>
                             <div className="text-[11px] font-mono text-white/40 break-all bg-black/20 p-3 rounded-xl max-h-32 overflow-y-auto">
                               {log.outcome}
                             </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}

        {filteredLogs.length === 0 && (
          <div className="text-center py-20 px-10 border-2 border-dashed border-white/5 rounded-3xl space-y-4">
             <div className="text-center text-4xl opacity-20">📜</div>
             <p className="text-sm font-black text-white/20 uppercase tracking-widest leading-none">Nothing found in this list</p>
          </div>
        )}
      </div>
    </div>
  );
}
