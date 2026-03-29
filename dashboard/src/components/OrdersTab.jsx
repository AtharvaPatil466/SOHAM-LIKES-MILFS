import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Truck,
  ShoppingBag,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Search,
  Banknote,
  RotateCcw,
  BadgePercent,
  CheckCircle2,
} from 'lucide-react';

const STATUS_STYLES = {
  delivered: { label: 'Delivered', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  pending: { label: 'Pending', bg: 'bg-amber-100', text: 'text-amber-700' },
  in_transit: { label: 'In Transit', bg: 'bg-blue-100', text: 'text-blue-700' },
  ordered: { label: 'Ordered', bg: 'bg-purple-100', text: 'text-purple-700' },
  returned: { label: 'Returned', bg: 'bg-rose-100', text: 'text-rose-700' },
  partially_returned: { label: 'Partial Return', bg: 'bg-rose-100', text: 'text-rose-700' },
  paid: { label: 'Paid', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  unpaid: { label: 'Unpaid', bg: 'bg-rose-100', text: 'text-rose-700' },
};

function formatCurrency(value) {
  return `Rs ${Math.round(value || 0).toLocaleString()}`;
}

function StatusBadge({ value }) {
  const style = STATUS_STYLES[value] || STATUS_STYLES.pending;
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${style.bg} ${style.text}`}>{style.label}</span>;
}

function OrderCard({ order, type, onPay, paying }) {
  const [expanded, setExpanded] = useState(false);
  const isVendor = type === 'vendor';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[24px] border border-black/5 bg-[rgba(255,252,247,0.92)] shadow-[0_14px_35px_rgba(0,0,0,0.04)] transition-all hover:bg-white"
    >
      <button onClick={() => setExpanded((prev) => !prev)} className="w-full p-4 text-left">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${isVendor ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700'}`}>
              {isVendor ? <Truck size={18} /> : <ShoppingBag size={18} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="truncate text-sm font-bold text-stone-900">{isVendor ? order.supplier_name : order.customer_name}</span>
                <StatusBadge value={order.status} />
                {isVendor ? <StatusBadge value={order.payment_status || 'unpaid'} /> : order.return_status ? <StatusBadge value={order.return_status} /> : null}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-stone-500 flex-wrap">
                <span>{order.order_id}</span>
                <span>|</span>
                <span>{new Date((order.timestamp || 0) * 1000).toLocaleDateString()}</span>
                {isVendor && order.payment_terms ? (
                  <>
                    <span>|</span>
                    <span>{order.payment_terms}</span>
                  </>
                ) : null}
                {!isVendor && order.payment_method ? (
                  <>
                    <span>|</span>
                    <span>{order.payment_method}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <div className="text-lg font-black text-stone-900">{formatCurrency(order.total_amount)}</div>
              <div className="text-[10px] text-stone-500">{order.items.length} items</div>
            </div>
            {expanded ? <ChevronUp size={14} className="text-stone-400" /> : <ChevronDown size={14} className="text-stone-400" />}
          </div>
        </div>
      </button>

      {expanded && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="border-t border-black/5 px-4 pb-4">
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[420px] space-y-2">
              <div className="grid grid-cols-[1fr_60px_90px_90px] gap-2 px-2 text-[10px] font-black uppercase tracking-[0.15em] text-stone-400">
                <span>Product</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Total</span>
              </div>
              {order.items.map((item, index) => (
                <div key={`${item.sku}-${index}`} className="grid grid-cols-[1fr_60px_90px_90px] items-center gap-2 rounded-xl border border-black/5 bg-white/70 px-2 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-stone-900">{item.product_name}</div>
                    <div className="text-[10px] text-stone-400">{item.sku}</div>
                  </div>
                  <div className="text-center text-sm font-bold text-stone-700">{item.qty}</div>
                  <div className="text-right text-sm text-stone-600">{formatCurrency(item.unit_price)}</div>
                  <div className="text-right text-sm font-bold text-stone-900">{formatCurrency(item.total)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-black/5 bg-white/75 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">GST</div>
              <div className="mt-2 text-lg font-black text-stone-900">{formatCurrency(order.gst_amount)}</div>
            </div>
            {isVendor ? (
              <>
                <div className="rounded-xl border border-black/5 bg-white/75 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Due Date</div>
                  <div className="mt-2 text-lg font-black text-stone-900">{order.due_date || 'Not set'}</div>
                </div>
                <div className="rounded-xl border border-black/5 bg-white/75 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Payment Status</div>
                  <div className={`mt-2 text-lg font-black ${(order.payment_status || 'unpaid') === 'paid' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {(order.payment_status || 'unpaid') === 'paid' ? 'Paid' : 'Outstanding'}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-black/5 bg-white/75 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Returned Amount</div>
                  <div className="mt-2 text-lg font-black text-rose-700">{formatCurrency(order.returned_amount)}</div>
                </div>
                <div className="rounded-xl border border-black/5 bg-white/75 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Net Amount</div>
                  <div className="mt-2 text-lg font-black text-stone-900">{formatCurrency(order.net_amount || order.total_amount)}</div>
                </div>
              </>
            )}
          </div>

          {isVendor && (order.payment_status || 'unpaid') !== 'paid' && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onPay(order.order_id);
              }}
              disabled={paying}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              <Banknote size={14} />
              {paying ? 'Marking paid...' : 'Mark as paid'}
            </button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function ReturnCard({ item, onProcess, processing }) {
  const [expanded, setExpanded] = useState(false);
  const totalQty = (item.items || []).reduce((sum, entry) => sum + (entry.qty || 0), 0);

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-[24px] border border-black/5 bg-white/80 shadow-[0_14px_35px_rgba(0,0,0,0.04)]">
      <button onClick={() => setExpanded((prev) => !prev)} className="w-full p-4 text-left">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-stone-900">{item.customer_name}</span>
              <StatusBadge value={item.status} />
            </div>
            <div className="mt-1 text-[10px] text-stone-500">
              {item.return_id} | {item.order_id} | {totalQty} units
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-black text-rose-700">{formatCurrency(item.refund_amount)}</div>
            <div className="text-[10px] text-stone-500">{item.refund_method}</div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-black/5 px-4 pb-4">
          <div className="mt-3 space-y-2">
            {(item.items || []).map((line, index) => (
              <div key={`${line.sku}-${index}`} className="flex items-center justify-between rounded-xl border border-black/5 bg-stone-50 px-3 py-2.5">
                <div>
                  <div className="text-sm font-semibold text-stone-900">{line.product_name}</div>
                  <div className="mt-0.5 text-[10px] text-stone-500">
                    Qty {line.qty} | {line.reason} | {line.action}
                  </div>
                </div>
                <div className="text-sm font-bold text-stone-900">{formatCurrency((line.unit_price || 0) * (line.qty || 0))}</div>
              </div>
            ))}
          </div>
          {item.status === 'pending' ? (
            <button
              onClick={() => onProcess(item.return_id)}
              disabled={processing}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
            >
              <RotateCcw size={14} />
              {processing ? 'Processing...' : 'Process return'}
            </button>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-stone-600">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Restocked {item.restocked_qty || 0}</span>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">Wastage {item.wastage_qty || 0}</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default function OrdersTab({ refreshTick = 0 }) {
  const [orders, setOrders] = useState({ customer_orders: [], vendor_orders: [] });
  const [returns, setReturns] = useState([]);
  const [vendorSummary, setVendorSummary] = useState({ unpaid_details: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('customer');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [payingOrderId, setPayingOrderId] = useState(null);
  const [processingReturnId, setProcessingReturnId] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersRes, returnsRes, vendorSummaryRes] = await Promise.all([
        fetch('/api/orders'),
        fetch('/api/returns'),
        fetch('/api/vendor-payments'),
      ]);
      const [ordersData, returnsData, vendorSummaryData] = await Promise.all([
        ordersRes.json(),
        returnsRes.json(),
        vendorSummaryRes.json(),
      ]);

      const dueMap = {};
      for (const item of vendorSummaryData?.unpaid_details || []) dueMap[item.order_id] = item;
      const vendorOrders = (ordersData?.vendor_orders || []).map((order) => ({ ...order, ...(dueMap[order.order_id] || {}) }));

      setOrders({ customer_orders: ordersData?.customer_orders || [], vendor_orders: vendorOrders });
      setReturns(returnsData || []);
      setVendorSummary(vendorSummaryData || { unpaid_details: [] });
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshTick]);

  const payVendor = async (orderId) => {
    setPayingOrderId(orderId);
    try {
      await fetch(`/api/vendor-orders/${orderId}/pay`, { method: 'POST' });
      await fetchData();
      window.dispatchEvent(new Event('retailos:data-changed'));
    } catch (err) {
      console.error('Failed to mark vendor order paid:', err);
    } finally {
      setPayingOrderId(null);
    }
  };

  const processReturn = async (returnId) => {
    setProcessingReturnId(returnId);
    try {
      await fetch(`/api/returns/${returnId}/process`, { method: 'POST' });
      await fetchData();
      window.dispatchEvent(new Event('retailos:data-changed'));
    } catch (err) {
      console.error('Failed to process return:', err);
    } finally {
      setProcessingReturnId(null);
    }
  };

  const currentOrders = view === 'customer' ? orders.customer_orders : orders.vendor_orders;

  const filteredOrders = currentOrders.filter((order) => {
    const matchesSearch = view === 'customer'
      ? (order.customer_name?.toLowerCase().includes(search.toLowerCase()) || order.order_id.toLowerCase().includes(search.toLowerCase()))
      : (order.supplier_name?.toLowerCase().includes(search.toLowerCase()) || order.order_id.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter || order.payment_status === statusFilter || order.return_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const sortedReturns = useMemo(() => [...returns].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)), [returns]);
  const pendingReturns = returns.filter((item) => item.status === 'pending');
  const processedReturns = returns.filter((item) => item.status === 'processed');
  const totalReturnValue = processedReturns.reduce((sum, item) => sum + (item.refund_amount || 0), 0);
  const totalWastageQty = processedReturns.reduce((sum, item) => sum + (item.wastage_qty || 0), 0);

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
          { label: 'Customer Revenue', value: formatCurrency(orders.customer_orders.reduce((sum, order) => sum + order.total_amount, 0)), color: 'text-emerald-700', bg: 'bg-emerald-100', icon: ShoppingBag },
          { label: 'Vendor Payables', value: formatCurrency(vendorSummary.total_unpaid), color: 'text-rose-700', bg: 'bg-rose-100', icon: Banknote },
          { label: 'Pending Returns', value: pendingReturns.length, color: 'text-amber-700', bg: 'bg-amber-100', icon: RotateCcw },
          { label: 'Wastage Units', value: totalWastageQty, color: 'text-stone-900', bg: 'bg-stone-200', icon: AlertCircle },
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

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[28px] border border-black/5 bg-[rgba(255,252,247,0.92)] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <RotateCcw size={16} className="text-rose-600" />
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Returns & Refunds Tracker</span>
            </div>
            <div className="text-xs font-semibold text-stone-500">{formatCurrency(totalReturnValue)} refunded</div>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-black/5 bg-white/75 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Pending</div>
              <div className="mt-2 text-xl font-black text-amber-700">{pendingReturns.length}</div>
            </div>
            <div className="rounded-xl border border-black/5 bg-white/75 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Processed</div>
              <div className="mt-2 text-xl font-black text-emerald-700">{processedReturns.length}</div>
            </div>
            <div className="rounded-xl border border-black/5 bg-white/75 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">GST Impact</div>
              <div className="mt-2 text-xl font-black text-stone-900">{formatCurrency(totalReturnValue * 0.05)}</div>
            </div>
          </div>
          <div className="space-y-3">
            {sortedReturns.slice(0, 6).map((item) => (
              <ReturnCard key={item.return_id} item={item} onProcess={processReturn} processing={processingReturnId === item.return_id} />
            ))}
            {sortedReturns.length === 0 && (
              <div className="rounded-[24px] border border-dashed border-black/10 bg-white/70 p-8 text-center text-stone-500">
                No returns logged yet.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2">
              {['customer', 'vendor'].map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    setView(option);
                    setStatusFilter('all');
                  }}
                  className={`flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-bold transition-all ${
                    view === option
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-black/10 bg-white/75 text-stone-600 hover:bg-white'
                  }`}
                >
                  {option === 'customer' ? <ShoppingBag size={15} /> : <Truck size={15} />}
                  {option === 'customer' ? 'Customer Orders' : 'Vendor Orders'}
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">
                    {option === 'customer' ? orders.customer_orders.length : orders.vendor_orders.length}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={view === 'customer' ? 'Search customer...' : 'Search supplier...'}
                  className="w-full rounded-xl border border-black/10 bg-white/85 py-2.5 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-teal-600/50 focus:outline-none"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-xl border border-black/10 bg-white/85 px-3 py-2.5 text-sm font-semibold text-stone-700 focus:border-teal-600/50 focus:outline-none"
              >
                <option value="all">All Status</option>
                <option value="delivered">Delivered</option>
                <option value="pending">Pending</option>
                {view === 'vendor' && <option value="in_transit">In Transit</option>}
                {view === 'vendor' && <option value="ordered">Ordered</option>}
                {view === 'vendor' && <option value="unpaid">Unpaid</option>}
                {view === 'vendor' && <option value="paid">Paid</option>}
                {view === 'customer' && <option value="partially_returned">Partial Return</option>}
                {view === 'customer' && <option value="returned">Returned</option>}
              </select>
            </div>
          </div>

          <div className="rounded-[28px] border border-black/5 bg-[rgba(255,252,247,0.92)] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {view === 'customer' ? <ShoppingBag size={16} className="text-teal-600" /> : <Truck size={16} className="text-blue-600" />}
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">
                  {view === 'customer' ? 'Customer Orders' : 'Supplier Orders & Payments'}
                </span>
              </div>
              {view === 'vendor' && vendorSummary.overdue_orders > 0 ? (
                <div className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
                  {vendorSummary.overdue_orders} overdue
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              {sortedOrders.map((order) => (
                <OrderCard
                  key={order.order_id}
                  order={order}
                  type={view}
                  onPay={payVendor}
                  paying={payingOrderId === order.order_id}
                />
              ))}
              {sortedOrders.length === 0 && (
                <div className="rounded-[24px] border border-dashed border-black/10 bg-white/70 p-10 text-center text-stone-500">
                  No orders match your filter.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-black/5 bg-[rgba(255,252,247,0.92)] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <div className="mb-4 flex items-center gap-2">
              <BadgePercent size={16} className="text-stone-600" />
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Payment Watch</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-black/5 bg-white/75 p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Unpaid Orders</div>
                <div className="mt-2 text-xl font-black text-rose-700">{vendorSummary.unpaid_orders || 0}</div>
              </div>
              <div className="rounded-xl border border-black/5 bg-white/75 p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Overdue Amount</div>
                <div className="mt-2 text-xl font-black text-amber-700">{formatCurrency(vendorSummary.overdue_amount)}</div>
              </div>
              <div className="rounded-xl border border-black/5 bg-white/75 p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Paid Orders</div>
                <div className="mt-2 text-xl font-black text-emerald-700">{vendorSummary.paid_orders || 0}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
