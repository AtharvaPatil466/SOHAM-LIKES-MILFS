import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bike, Clock, CheckCircle2, Phone, MapPin, Package, MessageCircle, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

const STATUS_CONFIG = {
  pending: { label: 'Pending', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', action: 'Accept' },
  accepted: { label: 'Accepted', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500', action: 'Out for Delivery' },
  out_for_delivery: { label: 'Out for Delivery', bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500', action: 'Mark Delivered' },
  delivered: { label: 'Delivered', bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', action: null },
};

function DeliveryCard({ request, onUpdateStatus }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
  const nextStatus = request.status === 'pending' ? 'accepted'
    : request.status === 'accepted' ? 'out_for_delivery'
    : request.status === 'out_for_delivery' ? 'delivered'
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-[24px] border shadow-[0_14px_35px_rgba(0,0,0,0.04)] transition-all ${
        request.status === 'delivered'
          ? 'border-black/5 bg-[rgba(255,252,247,0.7)] opacity-75'
          : 'border-black/5 bg-[rgba(255,252,247,0.92)] hover:bg-white'
      }`}
    >
      <button onClick={() => setExpanded(!expanded)} className="w-full p-4 text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${status.bg}`}>
              <Bike size={18} className={status.text} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-stone-900">{request.customer_name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${status.bg} ${status.text}`}>
                  {status.label}
                </span>
                {request.notes && request.notes.toLowerCase().includes('urgent') && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold uppercase text-red-700">Urgent</span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-3 text-[10px] text-stone-500">
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {request.delivery_slot}
                </span>
                <span>|</span>
                <span>{request.request_id}</span>
              </div>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-stone-500">
                <MapPin size={10} />
                <span className="truncate">{request.address}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <div className="text-lg font-black text-stone-900">Rs {request.total_amount.toLocaleString()}</div>
              <div className="text-[10px] text-stone-500">{request.items.length} items</div>
            </div>
            {expanded ? <ChevronUp size={14} className="text-stone-400" /> : <ChevronDown size={14} className="text-stone-400" />}
          </div>
        </div>
      </button>

      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="border-t border-black/5 px-4 pb-4"
        >
          <div className="mt-3 space-y-2">
            {request.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-black/5 bg-white/70 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-stone-900 truncate">{item.product_name}</div>
                  <div className="text-[10px] text-stone-400">{item.sku} | Qty: {item.qty}</div>
                </div>
                <div className="text-sm font-bold text-stone-800">Rs {(item.qty * item.unit_price).toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-3 text-xs text-stone-500">
            <a href={`tel:${request.phone}`} className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white/80 px-3 py-2 font-semibold text-stone-700 hover:bg-white">
              <Phone size={12} />
              Call
            </a>
            {request.notes && (
              <div className="flex items-center gap-1.5 rounded-lg border border-black/5 bg-stone-50 px-3 py-2 text-stone-600">
                <MessageCircle size={12} />
                <span className="italic">{request.notes}</span>
              </div>
            )}
          </div>

          {nextStatus && (
            <button
              onClick={(e) => { e.stopPropagation(); onUpdateStatus(request.request_id, nextStatus); }}
              className="mt-3 w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-teal-600"
            >
              {status.action}
            </button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

export default function DeliveryQueueTab({ refreshTick = 0 }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/delivery-requests');
        const data = await res.json();
        setRequests(data || []);
      } catch (err) {
        console.error('Failed to fetch delivery requests:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshTick]);

  const updateStatus = async (requestId, newStatus) => {
    try {
      const res = await fetch(`/api/delivery-requests/${requestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setRequests((prev) => prev.map((r) => r.request_id === requestId ? { ...r, status: newStatus } : r));
        window.dispatchEvent(new Event('retailos:data-changed'));
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const filtered = requests.filter((r) => {
    if (filter === 'active') return r.status !== 'delivered';
    if (filter === 'delivered') return r.status === 'delivered';
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const statusOrder = { pending: 0, accepted: 1, out_for_delivery: 2, delivered: 3 };
    return (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0) || b.requested_at - a.requested_at;
  });

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const activeCount = requests.filter((r) => r.status !== 'delivered').length;
  const totalDeliveryRevenue = requests.reduce((s, r) => s + r.total_amount, 0);
  const todayRevenue = requests.filter((r) => r.status === 'delivered').reduce((s, r) => s + r.total_amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-300 border-t-teal-700" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Pending Requests', value: pendingCount, color: 'text-amber-700', bg: 'bg-amber-100', icon: AlertCircle },
          { label: 'Active Deliveries', value: activeCount, color: 'text-blue-700', bg: 'bg-blue-100', icon: Bike },
          { label: 'Delivered Revenue', value: `Rs ${todayRevenue.toLocaleString()}`, color: 'text-emerald-700', bg: 'bg-emerald-100', icon: CheckCircle2 },
          { label: 'Total Pipeline', value: `Rs ${totalDeliveryRevenue.toLocaleString()}`, color: 'text-teal-700', bg: 'bg-teal-100', icon: Package },
        ].map((stat) => (
          <div key={stat.label} className="rounded-[24px] border border-black/5 bg-[rgba(255,252,247,0.72)] p-5 shadow-[0_14px_35px_rgba(0,0,0,0.04)]">
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${stat.bg}`}>
              <stat.icon size={18} className={stat.color} />
            </div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">{stat.label}</div>
            <div className={`mt-1 text-2xl font-black tracking-tight ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {[
            { key: 'active', label: 'Active', count: activeCount },
            { key: 'delivered', label: 'Delivered', count: requests.filter((r) => r.status === 'delivered').length },
            { key: 'all', label: 'All', count: requests.length },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-all ${
                filter === f.key
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-black/10 bg-white/75 text-stone-600 hover:bg-white'
              }`}
            >
              {f.label}
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{f.count}</span>
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-dashed border-teal-300/60 bg-teal-50/50 px-4 py-2 text-xs font-semibold text-teal-700">
          Direct delivery — no Swiggy/Blinkit fees
        </div>
      </div>

      <div className="space-y-3">
        {sorted.map((request) => (
          <DeliveryCard key={request.request_id} request={request} onUpdateStatus={updateStatus} />
        ))}
        {sorted.length === 0 && (
          <div className="rounded-[28px] border border-dashed border-black/10 bg-white/70 p-10 text-center text-stone-500">
            {filter === 'active' ? 'No active delivery requests.' : 'No delivery requests found.'}
          </div>
        )}
      </div>
    </div>
  );
}
