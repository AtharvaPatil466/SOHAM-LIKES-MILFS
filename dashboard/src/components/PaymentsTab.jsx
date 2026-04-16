import React, { useEffect, useMemo, useState } from 'react';
import { IndianRupee, CreditCard, Smartphone, Banknote, Wallet, ShieldCheck } from 'lucide-react';

const getApiBase = () => (typeof window !== 'undefined' ? window.location.origin : '');
const getToken = () => {
  try {
    return localStorage.getItem('retailos_token') || localStorage.getItem('token') || '';
  } catch {
    return '';
  }
};
const headers = () => ({
  Authorization: `Bearer ${getToken()}`,
  'Content-Type': 'application/json',
});

const METHOD_META = {
  cash: { label: 'Cash', icon: Banknote },
  upi: { label: 'UPI', icon: Smartphone },
  card: { label: 'Card', icon: CreditCard },
};

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatCard({ label, value, helper, icon: Icon, tone = 'accent' }) {
  const toneClass = {
    accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
    primary: 'bg-[rgba(215,193,194,0.18)] text-[var(--primary-ink)]',
    warning: 'bg-[var(--warning-soft)] text-[#d7c1c2]',
  }[tone];

  return (
    <div className="atelier-paper-soft rounded-[24px] p-5">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}>
        <Icon size={18} />
      </div>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--ink-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-black tracking-tight text-[var(--ink)]">{value}</div>
      <div className="mt-2 text-xs font-semibold text-[var(--ink-muted)]">{helper}</div>
    </div>
  );
}

export default function PaymentsTab() {
  const api = getApiBase();
  const [payments, setPayments] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');

  useEffect(() => {
    Promise.all([
      fetch(`${api}/api/payments/history`, { headers: headers() }).then((r) => r.json()),
      fetch(`${api}/api/payments/config`, { headers: headers() }).then((r) => r.json()),
    ])
      .then(([hist, conf]) => {
        setPayments(hist.payments || []);
        setConfig(conf || {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [api]);

  const recordPayment = async () => {
    if (!orderId || !amount) return;
    const resp = await fetch(`${api}/api/payments/record-offline`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ order_id: orderId, amount: parseFloat(amount), method }),
    });
    if (resp.ok) {
      const data = await resp.json();
      setPayments((prev) => [data.payment, ...prev]);
      setOrderId('');
      setAmount('');
      setMethod('cash');
    }
  };

  const totalCollected = useMemo(() => payments.reduce((sum, p) => sum + (p.amount || 0), 0), [payments]);
  const connected = Boolean(config.is_configured || config.razorpay_configured);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[rgba(215,193,194,0.28)] border-t-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total Collected"
          value={formatCurrency(totalCollected)}
          helper="Cash captured across offline and synced payments"
          icon={IndianRupee}
          tone="accent"
        />
        <StatCard
          label="Transactions"
          value={payments.length}
          helper="Recorded payment entries in the current ledger"
          icon={Wallet}
          tone="primary"
        />
        <StatCard
          label="Gateway Status"
          value={connected ? 'Connected' : 'Demo Mode'}
          helper="Razorpay configuration and fallback capture health"
          icon={ShieldCheck}
          tone="warning"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="atelier-paper rounded-[28px] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="atelier-label text-[10px] text-[var(--ink-muted)]">Payments Console</div>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--ink)]">Record a payment cleanly</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--ink-muted)]">
                Keep counter settlements, offline collections, and fallback entries inside the same ledger style as the rest of RetailOS.
              </p>
            </div>
            <div className={`atelier-chip ${connected ? 'bg-[var(--accent-soft)] text-[var(--primary-ink)]' : 'bg-[var(--warning-soft)] text-[var(--primary-ink)]'}`}>
              {connected ? 'Gateway Active' : 'Fallback Mode'}
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div>
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--ink-muted)]">Order ID</div>
              <input
                className="atelier-input-light w-full"
                placeholder="ORD-1024"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_0.9fr]">
              <div>
                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--ink-muted)]">Amount</div>
                <input
                  className="atelier-input-light w-full"
                  placeholder="Amount in Rs"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--ink-muted)]">Method</div>
                <select className="atelier-input-light w-full" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                </select>
              </div>
            </div>
          </div>

          <button
            className="mt-6 inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-black text-[#003738] transition-all hover:brightness-105"
            onClick={recordPayment}
          >
            Record Payment
          </button>
        </div>

        <div className="atelier-panel rounded-[28px] p-6 text-[var(--text)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="atelier-label text-[10px] text-[var(--text-muted)]">Method Mix</div>
              <h3 className="mt-2 font-display text-2xl font-bold">Payment channels in play</h3>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {Object.entries(METHOD_META).map(([key, meta]) => {
              const Icon = meta.icon;
              const count = payments.filter((payment) => payment.method === key).length;
              return (
                <div key={key} className="rounded-2xl border border-[rgba(67,72,72,0.18)] bg-[rgba(12,15,14,0.18)] p-4">
                  <div className="flex items-center gap-2 text-[var(--accent)]">
                    <Icon size={14} />
                    <span className="text-sm font-bold">{meta.label}</span>
                  </div>
                  <div className="mt-3 text-2xl font-black text-[var(--text)]">{count}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">Recorded transactions</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="atelier-paper-strong overflow-hidden rounded-[28px]">
        <div className="border-b border-black/5 px-6 py-5">
          <div className="atelier-label text-[10px] text-[var(--ink-muted)]">Payment History</div>
          <h3 className="mt-2 font-display text-2xl font-bold text-[var(--ink)]">Every payment in one ledger</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[rgba(215,193,194,0.16)] text-[var(--ink-muted)]">
              <tr>
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em]">Order</th>
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em]">Amount</th>
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em]">Method</th>
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em]">Status</th>
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em]">Time</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment, index) => {
                const meta = METHOD_META[payment.method] || METHOD_META.cash;
                const Icon = meta.icon;
                return (
                  <tr key={`${payment.order_id}-${index}`} className="border-t border-black/5">
                    <td className="px-6 py-4 font-mono text-xs text-[var(--ink)]">{payment.order_id}</td>
                    <td className="px-6 py-4 font-black text-[var(--primary-ink)]">{formatCurrency(payment.amount)}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(215,193,194,0.14)] px-3 py-1 text-xs font-bold text-[var(--primary-ink)]">
                        <Icon size={12} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[#24595a]">
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-[var(--ink-muted)]">
                      {payment.created_at ? new Date(payment.created_at * 1000).toLocaleString() : '-'}
                    </td>
                  </tr>
                );
              })}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm font-medium text-[var(--ink-muted)]">
                    No payments recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
