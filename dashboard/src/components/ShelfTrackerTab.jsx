import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, Snowflake, Zap, ArrowRight, MoveRight, Trash2, Layers, TrendingUp, ChevronDown, ChevronUp, Sparkles, Plus, Pencil, X, Eye, Package, Search } from 'lucide-react';

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

const SHELF_LEVELS = ['eye_level', 'upper', 'lower', 'bottom'];
const SHELF_LEVEL_LABELS = { eye_level: 'Eye Level', upper: 'Upper', lower: 'Lower', bottom: 'Bottom' };
const VELOCITY_STYLES = {
  fast_mover: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Fast' },
  moderate: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Moderate' },
  slow_mover: { bg: 'bg-red-100', text: 'text-red-700', label: 'Slow' },
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

function VelocityBadge({ classification }) {
  const style = VELOCITY_STYLES[classification];
  if (!style) return null;
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function ShelfLevelBadge({ level }) {
  const isEye = level === 'eye_level';
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase ${isEye ? 'bg-violet-100 text-violet-700' : 'bg-stone-100 text-stone-500'}`}>
      {isEye && <Eye size={8} />}
      {SHELF_LEVEL_LABELS[level] || level}
    </span>
  );
}

/* ─── Zone Create / Edit Modal ─── */
function ZoneFormModal({ zone, onClose, onSave }) {
  const [name, setName] = useState(zone?.zone_name || '');
  const [type, setType] = useState(zone?.zone_type || 'standard');
  const [slots, setSlots] = useState(zone?.total_slots || 6);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { zone_name: name, zone_type: type, total_slots: slots };
      if (zone) {
        await fetch(`/api/shelf-zones/zones/${zone.zone_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        await fetch('/api/shelf-zones/zones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      onSave();
    } catch (e) {
      console.error('Failed to save zone:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-[28px] border border-black/5 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-black text-stone-900">{zone ? 'Edit Zone' : 'Create New Zone'}</h3>
        <div className="mt-5 space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Zone Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Snacks & Chips"
              className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Zone Type</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 outline-none focus:border-teal-500">
              <option value="standard">Standard</option>
              <option value="high_traffic">High Traffic</option>
              <option value="refrigerated">Refrigerated</option>
              <option value="freezer">Freezer</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Total Slots</label>
            <input type="number" min={1} max={30} value={slots} onChange={e => setSlots(parseInt(e.target.value) || 1)}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-900 outline-none focus:border-teal-500" />
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-stone-600 hover:bg-stone-50">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name}
            className="flex-1 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-teal-800 disabled:opacity-50">
            {saving ? 'Saving...' : zone ? 'Update' : 'Create'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Product Assign Modal ─── */
function ProductAssignModal({ zoneId, onClose, onSave }) {
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedSku, setSelectedSku] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [shelfLevel, setShelfLevel] = useState('lower');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/inventory');
        setInventory(await res.json());
      } catch (e) { console.error(e); }
    })();
  }, []);

  const filtered = inventory.filter(i =>
    i.product_name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  const handleAssign = async () => {
    if (!selectedSku) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/shelf-zones/zones/${zoneId}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: selectedSku, product_name: selectedName, shelf_level: shelfLevel }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.detail || 'Failed to assign');
        return;
      }
      onSave();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-[28px] border border-black/5 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-black text-stone-900">Assign Product to Shelf</h3>
        <div className="mt-5 space-y-4">
          <div className="relative">
            <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Search Product</label>
            <div className="relative mt-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setSelectedSku(''); }} placeholder="Type product name or SKU..."
                className="w-full rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-4 py-2.5 text-sm font-semibold text-stone-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" />
            </div>
            {search && !selectedSku && (
              <div className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-lg">
                {filtered.map(item => (
                  <button key={item.sku} onClick={() => { setSelectedSku(item.sku); setSelectedName(item.product_name); setSearch(item.product_name); }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50">
                    <Package size={14} className="text-stone-400" />
                    <div>
                      <div className="text-sm font-semibold text-stone-900">{item.product_name}</div>
                      <div className="text-[10px] text-stone-500">{item.sku} · {item.current_stock} in stock · {item.daily_sales_rate}/day</div>
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && <div className="px-4 py-3 text-sm text-stone-500">No products found</div>}
              </div>
            )}
          </div>

          {selectedSku && (
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
              <div className="text-sm font-bold text-teal-900">{selectedName}</div>
              <div className="text-[10px] text-teal-700">{selectedSku}</div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-stone-500">Shelf Level</label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {SHELF_LEVELS.map(level => (
                <button key={level} onClick={() => setShelfLevel(level)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all ${shelfLevel === level ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}>
                  {level === 'eye_level' && <Eye size={10} className="mx-auto mb-1" />}
                  {SHELF_LEVEL_LABELS[level]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-stone-600 hover:bg-stone-50">Cancel</button>
          <button onClick={handleAssign} disabled={saving || !selectedSku}
            className="flex-1 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-teal-800 disabled:opacity-50">
            {saving ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Zone Card ─── */
function ZoneCard({ zone, expanded, onToggle, velocityMap, onEdit, onDelete, onAssign, onRemoveProduct }) {
  const type = ZONE_TYPE_STYLES[zone.zone_type] || ZONE_TYPE_STYLES.standard;
  const TypeIcon = type.icon;
  const occupied = zone.products.length;
  const empty = zone.total_slots - occupied;
  const avgDays = zone.products.length > 0
    ? Math.round(zone.products.reduce((s, p) => s + p.days_here, 0) / zone.products.length)
    : 0;
  const totalVelocity = zone.products.reduce((s, p) => s + p.daily_sales_rate, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-[28px] border border-black/5 bg-[rgba(255,252,247,0.92)] shadow-[0_18px_45px_rgba(0,0,0,0.05)] transition-all hover:bg-white">
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
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
          className="border-t border-black/5 px-5 pb-5">
          {/* Zone action buttons */}
          <div className="mt-3 flex gap-2">
            <button onClick={(e) => { e.stopPropagation(); onEdit(zone); }}
              className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-1.5 text-[10px] font-bold text-stone-600 hover:bg-stone-50">
              <Pencil size={10} /> Edit Zone
            </button>
            <button onClick={(e) => { e.stopPropagation(); onAssign(zone.zone_id); }}
              className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-[10px] font-bold text-teal-700 hover:bg-teal-100">
              <Plus size={10} /> Assign Product
            </button>
            {zone.products.length === 0 && (
              <button onClick={(e) => { e.stopPropagation(); onDelete(zone.zone_id); }}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-[10px] font-bold text-red-600 hover:bg-red-50">
                <Trash2 size={10} /> Delete
              </button>
            )}
          </div>

          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-[1fr_55px_55px_60px_55px_30px] gap-2 px-2 text-[10px] font-black uppercase tracking-[0.12em] text-stone-400">
              <span>Product</span>
              <span className="text-center">Level</span>
              <span className="text-center">Days</span>
              <span className="text-center">Sales/d</span>
              <span className="text-center">Speed</span>
              <span></span>
            </div>
            {zone.products.map((product) => {
              const vc = product.velocity_classification || velocityMap[product.sku];
              const isStale = product.days_here > 20;
              const isFast = product.daily_sales_rate >= 15;
              return (
                <div key={product.sku} className="grid grid-cols-[1fr_55px_55px_60px_55px_30px] items-center gap-2 rounded-xl border border-black/5 bg-white/70 px-2 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-stone-900 truncate">{product.product_name}</div>
                    <div className="text-[10px] text-stone-400">{product.sku}</div>
                  </div>
                  <div className="text-center">
                    <ShelfLevelBadge level={product.shelf_level || 'lower'} />
                  </div>
                  <div className={`text-center text-sm font-bold ${isStale ? 'text-red-600' : 'text-stone-700'}`}>
                    {product.days_here}d
                  </div>
                  <div className={`text-center text-sm font-bold ${isFast ? 'text-emerald-600' : 'text-stone-600'}`}>
                    {product.daily_sales_rate}
                  </div>
                  <div className="text-center">
                    <VelocityBadge classification={vc} />
                  </div>
                  <div className="text-center">
                    <button onClick={(e) => { e.stopPropagation(); onRemoveProduct(zone.zone_id, product.sku); }}
                      className="rounded-lg p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
            {empty > 0 && Array.from({ length: Math.min(empty, 2) }).map((_, i) => (
              <div key={`empty-${i}`} className="grid grid-cols-[1fr_55px_55px_60px_55px_30px] items-center gap-2 rounded-xl border border-dashed border-black/10 bg-white/40 px-2 py-2.5">
                <div className="text-sm text-stone-400 italic">Empty slot</div>
                <div /><div /><div /><div /><div />
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ─── AI Suggestion Card ─── */
function AISuggestionCard({ suggestion }) {
  const priority = PRIORITY_STYLES[suggestion.priority] || PRIORITY_STYLES.low;
  const typeIcons = {
    move: <MoveRight size={16} className="text-teal-600" />,
    remove: <Trash2 size={16} className="text-red-600" />,
    group: <Layers size={16} className="text-purple-600" />,
  };

  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
      className="rounded-[20px] border border-black/5 bg-white/80 p-4 shadow-sm transition-all hover:bg-white">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">{typeIcons[suggestion.type] || typeIcons.move}</div>
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

/* ─── Main Component ─── */
export default function ShelfTrackerTab() {
  const [data, setData] = useState({ zones: [], ai_suggestions: [] });
  const [velocityData, setVelocityData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedZone, setExpandedZone] = useState(null);
  const [showCreateZone, setShowCreateZone] = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [assigningZone, setAssigningZone] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeTriggered, setOptimizeTriggered] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [shelfRes, velRes] = await Promise.all([
        fetch('/api/shelf-zones'),
        fetch('/api/shelf-zones/velocity'),
      ]);
      const shelfData = await shelfRes.json();
      const velData = await velRes.json();
      setData(shelfData || { zones: [], ai_suggestions: [] });
      setVelocityData(velData);
    } catch (err) {
      console.error('Failed to fetch shelf data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build a velocity classification map from velocity data
  const velocityMap = {};
  if (velocityData?.products) {
    for (const p of velocityData.products) {
      velocityMap[p.sku] = p.classification;
    }
  }

  const handleOptimize = async () => {
    setOptimizing(true);
    try {
      const res = await fetch('/api/shelf-zones/optimize', { method: 'POST' });
      if (!res.ok) {
        throw new Error('Failed to trigger optimization');
      }
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      await fetchData();
      setOptimizeTriggered(true);
    } catch (e) {
      console.error('Failed to trigger optimization:', e);
    } finally {
      setOptimizing(false);
    }
  };

  const handleDeleteZone = async (zoneId) => {
    try {
      const res = await fetch(`/api/shelf-zones/zones/${zoneId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        alert(err.detail || 'Failed to delete');
        return;
      }
      fetchData();
    } catch (e) { console.error(e); }
  };

  const handleRemoveProduct = async (zoneId, sku) => {
    try {
      await fetch(`/api/shelf-zones/zones/${zoneId}/products/${sku}`, { method: 'DELETE' });
      fetchData();
    } catch (e) { console.error(e); }
  };

  const totalSlots = data.zones.reduce((s, z) => s + z.total_slots, 0);
  const totalOccupied = data.zones.reduce((s, z) => s + z.products.length, 0);
  const overallOccupancy = totalSlots > 0 ? ((totalOccupied / totalSlots) * 100).toFixed(0) : 0;
  const avgFitness = velocityData?.summary?.avg_zone_fitness || 0;
  const fastMovers = velocityData?.summary?.fast_movers || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-300 border-t-teal-700" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total Zones', value: data.zones.length, color: 'text-teal-700', bg: 'bg-teal-100', icon: LayoutGrid },
          { label: 'Occupancy', value: `${overallOccupancy}%`, color: 'text-emerald-700', bg: 'bg-emerald-100', icon: Layers },
          { label: 'Fast Movers', value: fastMovers, color: 'text-amber-700', bg: 'bg-amber-100', icon: TrendingUp },
          { label: 'Zone Fitness', value: `${(avgFitness * 100).toFixed(0)}%`, color: 'text-violet-700', bg: 'bg-violet-100', icon: Sparkles },
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

      {/* Main Grid */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
        {/* Zone List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-500">Store Zones</div>
            <button onClick={() => setShowCreateZone(true)}
              className="flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-teal-800 transition-colors">
              <Plus size={12} /> New Zone
            </button>
          </div>
          {data.zones.map((zone) => (
            <ZoneCard
              key={zone.zone_id}
              zone={zone}
              expanded={expandedZone === zone.zone_id}
              onToggle={() => setExpandedZone(expandedZone === zone.zone_id ? null : zone.zone_id)}
              velocityMap={velocityMap}
              onEdit={(z) => setEditingZone(z)}
              onDelete={handleDeleteZone}
              onAssign={(zid) => setAssigningZone(zid)}
              onRemoveProduct={handleRemoveProduct}
            />
          ))}
        </div>

        {/* AI Panel */}
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
                Based on 30-day sales velocity, zone fitness, and traffic patterns.
              </p>

              {/* Optimize Button */}
              <button onClick={handleOptimize} disabled={optimizing}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-stone-900 transition-all hover:bg-amber-400 disabled:opacity-50">
                <Sparkles size={14} />
                {optimizing ? 'Analyzing...' : 'Optimize Shelves with AI'}
              </button>

              <AnimatePresence>
                {optimizeTriggered && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="mt-3 rounded-xl bg-emerald-500/20 p-3 text-xs font-semibold text-emerald-300 text-center">
                    Optimization running. Check the Approvals tab for AI suggestions.
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-5 space-y-3">
                {data.ai_suggestions.map((suggestion, i) => (
                  <AISuggestionCard key={i} suggestion={suggestion} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCreateZone && (
          <ZoneFormModal onClose={() => setShowCreateZone(false)} onSave={() => { setShowCreateZone(false); fetchData(); }} />
        )}
        {editingZone && (
          <ZoneFormModal zone={editingZone} onClose={() => setEditingZone(null)} onSave={() => { setEditingZone(null); fetchData(); }} />
        )}
        {assigningZone && (
          <ProductAssignModal zoneId={assigningZone} onClose={() => setAssigningZone(null)} onSave={() => { setAssigningZone(null); fetchData(); }} />
        )}
      </AnimatePresence>
    </div>
  );
}
