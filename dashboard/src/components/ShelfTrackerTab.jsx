import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LayoutGrid, Snowflake, Zap, ArrowRight, Lightbulb, MoveRight, Trash2, Layers, Clock, TrendingUp, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';

const ZONE_TYPE_STYLES = {
  high_traffic: { label: 'High Traffic', bg: 'bg-amber-100', text: 'text-amber-700', icon: Zap },
  refrigerated: { label: 'Refrigerated', bg: 'bg-sky-100', text: 'text-sky-700', icon: Snowflake },
  freezer: { label: 'Freezer', bg: 'bg-blue-100', text: 'text-blue-700', icon: Snowflake },
  standard: { label: 'Standard', bg: 'bg-stone-100', text: 'text-stone-600', icon: LayoutGrid },
};

const PRIORITY_STYLES = {
  high: { bg: 'bg-red-100', text: 'text-red-700' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700' },
  low: { bg: 'bg-stone-100', text: 'text-stone-600' },
};

function OccupancyBar({ used, total }) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const color = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-teal-500';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2.5 rounded-full bg-stone-200 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-stone-600">{used}/{total}</span>
    </div>
  );
}

function ZoneCard({ zone, expanded, onToggle }) {
  const type = ZONE_TYPE_STYLES[zone.zone_type] || ZONE_TYPE_STYLES.standard;
  const TypeIcon = type.icon;
  const occupied = zone.products.length;
  const empty = zone.total_slots - occupied;
  const avgDays = zone.products.length > 0
    ? Math.round(zone.products.reduce((s, p) => s + p.days_here, 0) / zone.products.length)
    : 0;
  const totalVelocity = zone.products.reduce((s, p) => s + p.daily_sales_rate, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[28px] border border-black/5 bg-[rgba(255,252,247,0.92)] shadow-[0_18px_45px_rgba(0,0,0,0.05)] transition-all hover:bg-white"
    >
      <button onClick={onToggle} className="w-full p-5 text-left">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${type.bg}`}>
              <TypeIcon size={18} className={type.text} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-stone-900">{zone.zone_name}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${type.bg} ${type.text}`}>
                  {type.label}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-stone-500">{zone.zone_id}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-4 text-xs">
              <div className="text-center">
                <div className="font-black text-stone-900">{totalVelocity}</div>
                <div className="text-[9px] text-stone-500">units/day</div>
              </div>
              <div className="text-center">
                <div className="font-black text-stone-900">{avgDays}d</div>
                <div className="text-[9px] text-stone-500">avg age</div>
              </div>
            </div>
            {expanded ? <ChevronUp size={14} className="text-stone-400" /> : <ChevronDown size={14} className="text-stone-400" />}
          </div>
        </div>
        <div className="mt-4">
          <OccupancyBar used={occupied} total={zone.total_slots} />
        </div>
        {empty > 0 && (
          <div className="mt-2 text-[10px] font-semibold text-emerald-600">{empty} slot{empty > 1 ? 's' : ''} available</div>
        )}
      </button>

      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="border-t border-black/5 px-5 pb-5"
        >
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-[1fr_70px_70px_70px] gap-2 px-2 text-[10px] font-black uppercase tracking-[0.12em] text-stone-400">
              <span>Product</span>
              <span className="text-center">Days</span>
              <span className="text-center">Sales/d</span>
              <span className="text-right">Status</span>
            </div>
            {zone.products.map((product) => {
              const isStale = product.days_here > 20;
              const isFast = product.daily_sales_rate >= 15;
              return (
                <div key={product.sku} className="grid grid-cols-[1fr_70px_70px_70px] items-center gap-2 rounded-xl border border-black/5 bg-white/70 px-2 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-stone-900 truncate">{product.product_name}</div>
                    <div className="text-[10px] text-stone-400">{product.sku}</div>
                  </div>
                  <div className={`text-center text-sm font-bold ${isStale ? 'text-red-600' : 'text-stone-700'}`}>
                    {product.days_here}d
                  </div>
                  <div className={`text-center text-sm font-bold ${isFast ? 'text-emerald-600' : 'text-stone-600'}`}>
                    {product.daily_sales_rate}
                  </div>
                  <div className="text-right">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                      isFast ? 'bg-emerald-100 text-emerald-700' : isStale ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-600'
                    }`}>
                      {isFast ? 'Fast' : isStale ? 'Stale' : 'Normal'}
                    </span>
                  </div>
                </div>
              );
            })}
            {empty > 0 && Array.from({ length: Math.min(empty, 3) }).map((_, i) => (
              <div key={`empty-${i}`} className="grid grid-cols-[1fr_70px_70px_70px] items-center gap-2 rounded-xl border border-dashed border-black/10 bg-white/40 px-2 py-2.5">
                <div className="text-sm text-stone-400 italic">Empty slot</div>
                <div />
                <div />
                <div className="text-right">
                  <span className="rounded-full bg-stone-50 px-2 py-0.5 text-[9px] font-bold text-stone-400">Open</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function AISuggestionCard({ suggestion }) {
  const priority = PRIORITY_STYLES[suggestion.priority] || PRIORITY_STYLES.low;
  const typeIcons = {
    move: <MoveRight size={16} className="text-teal-600" />,
    remove: <Trash2 size={16} className="text-red-600" />,
    group: <Layers size={16} className="text-purple-600" />,
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="rounded-[20px] border border-black/5 bg-white/80 p-4 shadow-sm transition-all hover:bg-white"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          {typeIcons[suggestion.type] || typeIcons.move}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-stone-900">{suggestion.product_name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${priority.bg} ${priority.text}`}>
              {suggestion.priority}
            </span>
          </div>
          {suggestion.from_zone && suggestion.to_zone && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
              <span>{suggestion.from_zone}</span>
              <ArrowRight size={10} />
              <span className="font-semibold text-teal-700">{suggestion.to_zone}</span>
            </div>
          )}
          <p className="mt-2 text-xs leading-relaxed text-stone-600">{suggestion.reason}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function ShelfTrackerTab() {
  const [data, setData] = useState({ zones: [], ai_suggestions: [] });
  const [loading, setLoading] = useState(true);
  const [expandedZone, setExpandedZone] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/shelf-zones');
        const d = await res.json();
        setData(d || { zones: [], ai_suggestions: [] });
      } catch (err) {
        console.error('Failed to fetch shelf zones:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalSlots = data.zones.reduce((s, z) => s + z.total_slots, 0);
  const totalOccupied = data.zones.reduce((s, z) => s + z.products.length, 0);
  const overallOccupancy = totalSlots > 0 ? ((totalOccupied / totalSlots) * 100).toFixed(0) : 0;
  const totalProducts = data.zones.reduce((s, z) => s + z.products.length, 0);
  const highPrioritySuggestions = data.ai_suggestions.filter((s) => s.priority === 'high').length;

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
          { label: 'Total Zones', value: data.zones.length, color: 'text-teal-700', bg: 'bg-teal-100', icon: LayoutGrid },
          { label: 'Occupancy', value: `${overallOccupancy}%`, color: 'text-emerald-700', bg: 'bg-emerald-100', icon: Layers },
          { label: 'Products Placed', value: totalProducts, color: 'text-amber-700', bg: 'bg-amber-100', icon: TrendingUp },
          { label: 'AI Actions', value: highPrioritySuggestions, color: 'text-red-700', bg: 'bg-red-100', icon: Sparkles },
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
        <div className="space-y-4">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-500">Store Zones</div>
          {data.zones.map((zone) => (
            <ZoneCard
              key={zone.zone_id}
              zone={zone}
              expanded={expandedZone === zone.zone_id}
              onToggle={() => setExpandedZone(expandedZone === zone.zone_id ? null : zone.zone_id)}
            />
          ))}
        </div>

        <div>
          <div className="sticky top-28">
            <div className="rounded-[28px] border border-black/5 bg-stone-900 p-5 text-stone-50 shadow-[0_22px_55px_rgba(0,0,0,0.18)]">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400">
                  <Sparkles size={18} />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">AI Shelf Coach</div>
                  <h3 className="font-display mt-1 text-xl font-bold">Placement Suggestions</h3>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-stone-400">
                Based on sales velocity, product categories, and zone traffic patterns.
              </p>
              <div className="mt-5 space-y-3">
                {data.ai_suggestions.map((suggestion, i) => (
                  <AISuggestionCard key={i} suggestion={suggestion} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
