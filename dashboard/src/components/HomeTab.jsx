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
  RotateCw
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
    if (log.skill === 'inventory') return <Package size={14} className="text-warning" />;
    if (log.skill === 'procurement') return < TrendingUp size={14} className="text-primary" />;
    if (log.skill === 'negotiation') return <RotateCw size={14} className="text-success" />;
    if (log.skill === 'customer') return <Megaphone size={14} className="text-purple-500" />;
    return <CheckCircle2 size={14} className="text-white/40" />;
  };

  const getLogMessage = (log) => {
    // Simplify common system events into plain English
    if (log.skill === 'inventory' && log.event_type === 'low_stock_detected') {
      const data = JSON.parse(log.outcome);
      const icon = PRODUCT_ICONS[data.sku] || '📦';
      return `${icon} ${data.product_name} was running low. Checking with suppliers...`;
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
    
    // Default to a cleaner version of the decision
    return log.decision;
  };

  const getStatusColor = (log) => {
    if (log.status === 'alert' || log.status === 'pending') return 'bg-warning';
    if (log.status === 'error' || log.status === 'failed') return 'bg-danger';
    if (log.status === 'success' || log.status === 'approved') return 'bg-success';
    return 'bg-primary';
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <motion.button
        onClick={onGoToApprovals}
        whileTap={{ scale: 0.98 }}
        className={`w-full p-4 rounded-2xl flex items-center justify-between text-left transition-all shadow-xl shadow-black/20 ${
          approvalCount > 0 
            ? 'bg-warning text-black font-black' 
            : 'bg-success/10 border border-success/20 text-success font-bold'
        }`}
      >
        <div className="flex items-center gap-3">
          {approvalCount > 0 ? (
            <AlertCircle size={24} strokeWidth={3} />
          ) : (
            <CheckCircle2 size={24} strokeWidth={3} />
          )}
          <span className="text-sm">
            {approvalCount > 0 
              ? `I need your decision on ${approvalCount} things`
              : "RetailOS is handling everything. Relax."}
          </span>
        </div>
        {approvalCount > 0 && (
          <div className="flex items-center gap-1 bg-black/10 px-2 py-1 rounded-full">
            <span className="text-[10px] uppercase font-black uppercase tracking-widest">See Now</span>
            <ChevronRight size={14} strokeWidth={3} />
          </div>
        )}
      </motion.button>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Money Saved', value: `₹${stats.moneySaved}`, icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
          { label: 'Orders Placed', value: stats.ordersPlaced, icon: Package, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Offers Sent', value: stats.offersSent, icon: Megaphone, color: 'text-purple-400', bg: 'bg-purple-400/10' },
          { label: 'Hours Saved', value: `${stats.hoursSaved} hrs`, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-4 rounded-2xl bg-zinc-900/50 border border-white/5 space-y-1"
          >
            <div className={`w-8 h-8 rounded-full ${stat.bg} flex items-center justify-center mb-2`}>
              <stat.icon size={16} className={stat.color} />
            </div>
            <div className="text-xs font-bold text-white/40 uppercase tracking-tight">{stat.label}</div>
            <div className={`text-xl font-black ${stat.color}`}>{stat.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Activity Feed */}
      <div className="space-y-4">
        <h2 className="text-xs font-black text-white/40 uppercase tracking-widest px-1">What's happening right now</h2>
        <div className="space-y-3">
          {logs.slice(0, 15).map((log, i) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-start gap-4 p-3 rounded-2xl bg-zinc-900/30 hover:bg-zinc-900/50 transition-colors group"
            >
              <div className="relative mt-1">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(log)} shadow-[0_0_8px_rgba(255,255,255,0.2)]`} />
                <div className={`absolute inset-0 w-2 h-2 rounded-full ${getStatusColor(log)} animate-ping opacity-20`} />
              </div>
              <div className="flex-1 space-y-1">
                <div className="text-[13px] font-medium leading-snug line-clamp-2 text-white/90">
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
            </motion.div>
          ))}
          {logs.length === 0 && (
            <div className="text-center py-12 text-white/20 font-bold uppercase tracking-widest italic border-2 border-dashed border-white/5 rounded-3xl">
              Waiting for actions...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
