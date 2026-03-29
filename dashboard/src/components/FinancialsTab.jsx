import React, { useEffect, useMemo, useState } from 'react';
import {
  IndianRupee,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Receipt,
  CreditCard,
  PieChart,
  BadgePercent,
  MessageSquareShare,
  AlertTriangle,
  CheckCircle2,
  Copy,
} from 'lucide-react';

function formatCurrency(value) {
  return `Rs ${Math.round(value || 0).toLocaleString()}`;
}

function BreakdownBar({ items, total }) {
  const colors = ['bg-teal-600', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500', 'bg-rose-500', 'bg-indigo-500', 'bg-orange-500'];
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-stone-200">
        {items.map((item, index) => {
          const pct = total > 0 ? (item.amount / total) * 100 : 0;
          return <div key={item.label} className={`${colors[index % colors.length]} transition-all`} style={{ width: `${pct}%` }} title={`${item.label}: ${formatCurrency(item.amount)}`} />;
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {items.map((item, index) => (
          <div key={item.label} className="flex items-center gap-2 text-xs">
            <div className={`h-2.5 w-2.5 rounded-full ${colors[index % colors.length]}`} />
            <span className="font-semibold text-stone-700">{item.label}</span>
            <span className="text-stone-500">{formatCurrency(item.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, bg, helper }) {
  return (
    <div className="rounded-[24px] border border-black/5 bg-[rgba(255,252,247,0.72)] p-5 shadow-[0_14px_35px_rgba(0,0,0,0.04)]">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${bg}`}>
        <Icon size={18} className={color} />
      </div>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">{label}</div>
      <div className={`mt-1 text-2xl font-black tracking-tight ${color}`}>{value}</div>
      {helper && <div className="mt-2 text-xs font-semibold text-stone-500">{helper}</div>}
    </div>
  );
}

export default function FinancialsTab({ refreshTick = 0 }) {
  const [orders, setOrders] = useState({ customer_orders: [], vendor_orders: [] });
  const [vendorSummary, setVendorSummary] = useState({ unpaid_details: [] });
  const [gstSummary, setGstSummary] = useState(null);
  const [dailySummary, setDailySummary] = useState(null);
  const [udhaar, setUdhaar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersRes, vendorRes, gstRes, dailyRes, udhaarRes] = await Promise.all([
        fetch('/api/orders'),
        fetch('/api/vendor-payments'),
        fetch('/api/gst/summary'),
        fetch('/api/daily-summary'),
        fetch('/api/udhaar'),
      ]);
      const [ordersData, vendorData, gstData, dailyData, udhaarData] = await Promise.all([
        ordersRes.json(),
        vendorRes.json(),
        gstRes.json(),
        dailyRes.json(),
        udhaarRes.json(),
      ]);
      setOrders(ordersData || { customer_orders: [], vendor_orders: [] });
      setVendorSummary(vendorData || { unpaid_details: [] });
      setGstSummary(gstData || null);
      setDailySummary(dailyData || null);
      setUdhaar(udhaarData || []);
    } catch (err) {
      console.error('Failed to fetch financial data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshTick]);

  useEffect(() => {
    if (!copied) return undefined;
    const timeout = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timeout);
  }, [copied]);

  const totals = useMemo(() => {
    const totalRevenue = orders.customer_orders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
    const totalProcurement = orders.vendor_orders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
    const grossProfit = totalRevenue - totalProcurement;
    const margin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';
    const udhaarOutstanding = udhaar.reduce((sum, ledger) => sum + (ledger.balance || 0), 0);
    return { totalRevenue, totalProcurement, grossProfit, margin, udhaarOutstanding };
  }, [orders, udhaar]);

  const paymentItems = useMemo(() => {
    const paymentBreakdown = {};
    for (const order of orders.customer_orders) {
      const method = order.payment_method || 'Other';
      paymentBreakdown[method] = (paymentBreakdown[method] || 0) + order.total_amount;
    }
    return Object.entries(paymentBreakdown)
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [orders.customer_orders]);

  const supplierItems = useMemo(() => {
    const supplierBreakdown = {};
    for (const order of orders.vendor_orders) {
      supplierBreakdown[order.supplier_name] = (supplierBreakdown[order.supplier_name] || 0) + order.total_amount;
    }
    return Object.entries(supplierBreakdown)
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [orders.vendor_orders]);

  const recentTransactions = useMemo(() => {
    return [
      ...orders.customer_orders.map((order) => ({ ...order, type: 'income', label: order.customer_name })),
      ...orders.vendor_orders.map((order) => ({ ...order, type: 'expense', label: order.supplier_name })),
    ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [orders]);

  const copySummary = async () => {
    if (!dailySummary?.summary) return;
    try {
      await navigator.clipboard.writeText(dailySummary.summary);
      setCopied(true);
    } catch (err) {
      console.error('Failed to copy summary:', err);
    }
  };

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
        <StatCard label="Total Revenue" value={formatCurrency(totals.totalRevenue)} icon={TrendingUp} color="text-emerald-700" bg="bg-emerald-100" helper="All customer sales" />
        <StatCard label="Total Procurement" value={formatCurrency(totals.totalProcurement)} icon={TrendingDown} color="text-blue-700" bg="bg-blue-100" helper="All supplier orders" />
        <StatCard label="Outstanding Udhaar" value={formatCurrency(totals.udhaarOutstanding)} icon={Wallet} color="text-amber-700" bg="bg-amber-100" helper={`${udhaar.filter((ledger) => ledger.balance > 0).length} active credit accounts`} />
        <StatCard label="Vendor Payables" value={formatCurrency(vendorSummary.total_unpaid)} icon={CreditCard} color="text-rose-700" bg="bg-rose-100" helper={`${vendorSummary.unpaid_orders || 0} unpaid orders`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[28px] border border-black/5 bg-[rgba(255,252,247,0.92)] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="mb-4 flex items-center gap-2">
            <BadgePercent size={16} className="text-teal-600" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">GST & Billing</span>
          </div>

          {gstSummary && (
            <>
              <div className="mb-4 rounded-2xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-sm font-semibold text-teal-800">
                Reporting period: {gstSummary.reporting_period}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-black/5 bg-white/75 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Output GST</div>
                  <div className="mt-2 text-2xl font-black text-stone-900">{formatCurrency(gstSummary.output_gst)}</div>
                  <div className="mt-1 text-xs text-stone-500">Collected from sales</div>
                </div>
                <div className="rounded-xl border border-black/5 bg-white/75 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Input GST</div>
                  <div className="mt-2 text-2xl font-black text-emerald-700">{formatCurrency(gstSummary.input_gst)}</div>
                  <div className="mt-1 text-xs text-stone-500">Claimable on purchases</div>
                </div>
                <div className="rounded-xl border border-black/5 bg-white/75 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Return Adjustment</div>
                  <div className="mt-2 text-2xl font-black text-amber-700">{formatCurrency(gstSummary.refund_adjustment)}</div>
                  <div className="mt-1 text-xs text-stone-500">Processed refunds reducing liability</div>
                </div>
                <div className="rounded-xl border border-black/5 bg-white/75 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Net Liability</div>
                  <div className={`mt-2 text-2xl font-black ${gstSummary.net_liability >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {formatCurrency(gstSummary.net_liability)}
                  </div>
                  <div className="mt-1 text-xs text-stone-500">Output minus input and refunds</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="rounded-[28px] border border-black/5 bg-stone-900 p-6 text-stone-50 shadow-[0_18px_45px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquareShare size={16} className="text-amber-300" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">WhatsApp Cash Summary</span>
              </div>
              <h3 className="mt-2 font-display text-2xl font-bold">Morning owner message</h3>
            </div>
            {dailySummary?.metrics?.pending_approvals > 0 ? (
              <div className="rounded-full bg-amber-400/15 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">
                {dailySummary.metrics.pending_approvals} approvals open
              </div>
            ) : (
              <div className="rounded-full bg-emerald-400/15 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                Clear start
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/5 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Summary Date</div>
              <div className="mt-2 text-lg font-black text-white">{dailySummary?.summary_date || 'N/A'}</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-stone-400">Top Seller</div>
              <div className="mt-2 text-lg font-black text-white">{dailySummary?.metrics?.top_product || 'None'}</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-white/5 p-4">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-stone-200">{dailySummary?.summary}</pre>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={copySummary}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/15"
            >
              <Copy size={14} />
              {copied ? 'Copied' : 'Copy message'}
            </button>
            {dailySummary?.whatsapp_link && (
              <a
                href={dailySummary.whatsapp_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-400"
              >
                <MessageSquareShare size={14} />
                Open in WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[28px] border border-black/5 bg-[rgba(255,252,247,0.92)] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="mb-4 flex items-center gap-2">
            <Receipt size={16} className="text-teal-600" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Revenue Mix</span>
          </div>
          <BreakdownBar items={paymentItems} total={totals.totalRevenue} />
          <div className="mt-5 rounded-2xl border border-black/5 bg-white/75 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Gross Profit</div>
            <div className={`mt-2 text-3xl font-black ${totals.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {formatCurrency(totals.grossProfit)}
            </div>
            <div className="mt-1 text-xs font-semibold text-stone-500">Margin {totals.margin}%</div>
          </div>
        </div>

        <div className="rounded-[28px] border border-black/5 bg-[rgba(255,252,247,0.92)] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="mb-4 flex items-center gap-2">
            <CreditCard size={16} className="text-rose-600" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Payables Watch</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-black/5 bg-white/75 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Unpaid</div>
              <div className="mt-2 text-xl font-black text-rose-700">{formatCurrency(vendorSummary.total_unpaid)}</div>
            </div>
            <div className="rounded-xl border border-black/5 bg-white/75 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Overdue Orders</div>
              <div className="mt-2 text-xl font-black text-stone-900">{vendorSummary.overdue_orders || 0}</div>
            </div>
            <div className="rounded-xl border border-black/5 bg-white/75 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Overdue Amount</div>
              <div className="mt-2 text-xl font-black text-amber-700">{formatCurrency(vendorSummary.overdue_amount)}</div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {(vendorSummary.unpaid_details || []).slice(0, 5).map((item) => (
              <div key={item.order_id} className="flex items-center justify-between rounded-xl border border-black/5 bg-white/75 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-stone-900">{item.supplier_name}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-stone-500 flex-wrap">
                    <span>{item.order_id}</span>
                    <span>Due {item.due_date}</span>
                    {item.is_overdue ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">
                        <AlertTriangle size={10} />
                        {item.overdue_days}d overdue
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">
                        <CheckCircle2 size={10} />
                        On track
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm font-black text-stone-900">{formatCurrency(item.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-black/5 bg-[rgba(255,252,247,0.92)] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
        <div className="mb-4 flex items-center gap-2">
          <IndianRupee size={16} className="text-stone-600" />
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Recent Transactions</span>
        </div>
        <div className="space-y-2">
          {recentTransactions.slice(0, 10).map((txn) => (
            <div key={txn.order_id} className="flex items-center justify-between gap-4 rounded-xl border border-black/5 bg-white/75 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${txn.type === 'income' ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                  {txn.type === 'income' ? <ArrowUpRight size={14} className="text-emerald-700" /> : <ArrowDownRight size={14} className="text-rose-700" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-stone-900">{txn.label}</div>
                  <div className="text-[10px] text-stone-500">
                    {txn.order_id} | {new Date((txn.timestamp || 0) * 1000).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className={`text-sm font-black ${txn.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                {txn.type === 'income' ? '+' : '-'} {formatCurrency(txn.total_amount)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {supplierItems.length > 0 && (
        <div className="rounded-[28px] border border-black/5 bg-[rgba(255,252,247,0.92)] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="mb-4 flex items-center gap-2">
            <PieChart size={16} className="text-blue-600" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Procurement by Supplier</span>
          </div>
          <BreakdownBar items={supplierItems} total={totals.totalProcurement} />
        </div>
      )}
    </div>
  );
}
