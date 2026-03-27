import React from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Package, 
  Megaphone, 
  Clock,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Zap,
  ArrowUpRight
} from 'lucide-react';

const PRODUCT_ICONS = {
  'SKU-001': '🍦', // Ice Cream
  'SKU-002': '🧂', // Salt
  'SKU-003': '🍼', // Milk
  'SKU-004': '🍞', // Bread
  'SKU-005': '🥚', // Eggs
};

export default function HomeTab({ stats, logs, approvalCount, onGoToApprovals }) {
  const getEventIcon = (log) => {
    if (log.skill === 'inventory') return <Package size={14} className="text-amber-400" />;
    if (log.skill === 'procurement') return <TrendingUp size={14} className="text-blue-400" />;
    if (log.skill === 'negotiation') return <RotateCw size={14} className="text-green-400" />;
    if (log.skill === 'customer') return <Megaphone size={14} className="text-purple-400" />;
    return <CheckCircle2 size={14} className="text-white/40" />;
  };

  const getLogMessage = (log) => {
    if (log.skill === 'inventory' && log.event_type === 'low_stock_detected') {
      try {
        const data = JSON.parse(log.outcome);
        const icon = PRODUCT_ICONS[data.sku] || '📦';
        return `${icon} ${data.product_name} was running low. Checking with suppliers...`;
      } catch { return log.decision; }
    }
    if (log.skill === 'negotiation' && log.event_type === 'outreach_sent') {
      const meta = log.metadata || {};
      return `🤝 Sent a message to ${meta.supplier_id || 'supplier'} to get a better price.`;
    }
    if (log.skill === 'negotiation' && log.event_type === 'reply_parsed') {
      return `💬 Supplier replied! They offered a good deal. Waiting for your approval.`;
    }
    if (log.skill === 'customer' && log.event_type === 'offer_sent') {
      return `📣 Sent a special offer to customers. 12 people already looked at it!`;
    }
    if (log.skill === 'orchestrator' && log.event_type === 'owner_approved') {
      return `✅ You approved the order. I've placed it with the supplier.`;
    }
    return log.decision;
  };

  const getStatusColor = (log) => {
    if (log.status === 'alert' || log.status === 'pending') return 'bg-amber-400';
    if (log.status === 'error' || log.status === 'failed') return 'bg-red-500';
    if (log.status === 'success' || log.status === 'approved') return 'bg-green-500';
    return 'bg-blue-500';
  };

  const statCards = [
    { label: 'Money Saved', value: `₹${stats.moneySaved.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/10' },
    { label: 'Orders Placed', value: stats.ordersPlaced, icon: Package, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/10' },
    { label: 'Offers Sent', value: stats.offersSent, icon: Megaphone, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/10' },
    { label: 'Hours Saved', value: `${stats.hoursSaved} hrs`, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/10' },
  ];

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Banner */}
      <motion.button
        onClick={onGoToApprovals}
        whileTap={{ scale: 0.98 }}
        className={`w-full p-4 lg:p-5 rounded-2xl flex items-center justify-between text-left transition-all shadow-xl shadow-black/20 ${
          approvalCount > 0 
            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black' 
            : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold'
        }`}
      >
        <div className="flex items-center gap-3">
          {approvalCount > 0 ? (
            <AlertCircle size={24} strokeWidth={3} />
          ) : (
            <CheckCircle2 size={24} strokeWidth={3} />
          )}
          <div>
            <span className="text-sm lg:text-base block">
              {approvalCount > 0 
                ? `I need your decision on ${approvalCount} things`
                : "RetailOS is handling everything. Relax."}
            </span>
            {approvalCount > 0 && (
              <span className="text-[10px] opacity-70 font-medium block mt-0.5">
                Tap to review and approve or reject
              </span>
            )}
          </div>
        </div>
        {approvalCount > 0 && (
          <div className="flex items-center gap-1 bg-black/10 px-3 py-1.5 rounded-full">
            <span className="text-[10px] uppercase font-black tracking-widest">See Now</span>
            <ChevronRight size={14} strokeWidth={3} />
          </div>
        )}
      </motion.button>

      {/* Stats Grid — 2 cols mobile, 4 cols desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className={`p-4 lg:p-5 rounded-2xl bg-zinc-900/50 border border-white/5 hover:border-white/10 transition-all group`}
          >
            <div className={`w-9 h-9 lg:w-10 lg:h-10 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon size={18} className={stat.color} />
            </div>
            <div className="text-[10px] lg:text-xs font-bold text-white/30 uppercase tracking-tight">{stat.label}</div>
            <div className={`text-xl lg:text-2xl font-black ${stat.color} mt-0.5 tracking-tight`}>{stat.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Activity Feed — full width on mobile, constrained on desktop */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black text-white/40 uppercase tracking-widest">What's happening right now</h2>
          <div className="hidden lg:flex items-center gap-1.5 text-[10px] font-bold text-white/20 uppercase tracking-widest">
            <Zap size={10} className="text-blue-400" />
            <span>Live Feed</span>
          </div>
        </div>
        <div className="space-y-2 lg:space-y-2.5">
          {logs.slice(0, 20).map((log, i) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-start gap-3 lg:gap-4 p-3 lg:p-4 rounded-2xl bg-zinc-900/30 hover:bg-zinc-900/60 transition-all group cursor-default"
            >
              <div className="relative mt-1.5 flex-shrink-0">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(log)}`} />
                <div className={`absolute inset-0 w-2 h-2 rounded-full ${getStatusColor(log)} animate-ping opacity-20`} />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-[13px] lg:text-sm font-medium leading-snug text-white/90">
                  {getLogMessage(log)}
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-[10px] font-bold text-white/20 uppercase tracking-wider">
                    {new Date(log.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <span className="text-white/10 text-[8px]">•</span>
                  <div className="flex items-center gap-1">
                    {getEventIcon(log)}
                    <span className="text-[10px] font-bold text-white/20 uppercase tracking-tighter">
                      {log.skill === 'orchestrator' ? 'Manager' : log.skill}
                    </span>
                  </div>
                </div>
              </div>
              <div className="hidden lg:block opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowUpRight size={14} className="text-white/20" />
              </div>
            </motion.div>
          ))}
          {logs.length === 0 && (
            <div className="text-center py-16 lg:py-20 text-white/20 font-bold uppercase tracking-widest italic border-2 border-dashed border-white/5 rounded-3xl">
              Waiting for actions...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
