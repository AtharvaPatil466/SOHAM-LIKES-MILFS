import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api';
import { motion } from 'framer-motion';
import {
  Search,
  User,
  Phone,
  ShoppingBag,
  Star,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Tag,
  Wallet,
  Send,
  Banknote,
  RotateCcw,
  MessageCircle,
} from 'lucide-react';

function formatCurrency(value) {
  return `Rs ${Math.round(value || 0).toLocaleString()}`;
}

function formatDate(value) {
  if (!value) return 'No recent activity';
  const raw = typeof value === 'number' ? value * 1000 : value;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'No recent activity';
  return date.toLocaleDateString();
}

function getCategoryColor(category) {
  const map = {
    Frozen: 'bg-blue-100 text-blue-700',
    Dairy: 'bg-amber-100 text-amber-700',
    Snacks: 'bg-orange-100 text-orange-700',
    Beverages: 'bg-teal-100 text-teal-700',
    Staples: 'bg-stone-200 text-stone-700',
    Grocery: 'bg-emerald-100 text-emerald-700',
    'Personal Care': 'bg-pink-100 text-pink-700',
    Cleaning: 'bg-sky-100 text-sky-700',
    'Baby Care': 'bg-purple-100 text-purple-700',
    Biscuits: 'bg-yellow-100 text-yellow-700',
    'Home Care': 'bg-indigo-100 text-indigo-700',
  };
  return map[category] || 'bg-stone-100 text-stone-600';
}

function getTopCategories(history = []) {
  const counts = {};
  for (const item of history) {
    counts[item.category] = (counts[item.category] || 0) + item.quantity;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);
}

function getFallbackSpend(customer) {
  return (customer.purchase_history || []).reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function getRecommendations(customer, allCustomers) {
  const boughtProducts = new Set((customer.purchase_history || []).map((p) => p.product));
  const topCats = getTopCategories(customer.purchase_history || []);
  const recs = [];
  for (const other of allCustomers) {
    if (other.customer_id === customer.customer_id) continue;
    for (const item of other.purchase_history || []) {
      if (!boughtProducts.has(item.product) && topCats.includes(item.category)) {
        if (!recs.find((rec) => rec.product === item.product)) {
          recs.push({ product: item.product, category: item.category, reason: `Popular in ${item.category}` });
        }
      }
    }
  }
  return recs.slice(0, 4);
}

function CustomerCard({
  customer,
  ledger,
  allCustomers,
  expanded,
  onToggle,
  paymentDraft,
  onPaymentDraftChange,
  onPaymentSubmit,
  onSendReminder,
  processingPayment,
  sendingReminder,
}) {
  const topCats = getTopCategories(customer.purchase_history || []);
  const recs = getRecommendations(customer, allCustomers);
  const displaySpend = customer.net_spend || customer.total_order_value || getFallbackSpend(customer);
  const outstanding = customer.udhaar_balance || 0;
  const canPay = outstanding > 0 && Number(paymentDraft.amount || 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[28px] border border-black/5 bg-[rgba(255,252,247,0.92)] shadow-[0_18px_45px_rgba(0,0,0,0.05)] transition-all hover:bg-white"
    >
      <button onClick={onToggle} className="w-full p-5 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-amber-600 text-lg font-bold text-white">
              {customer.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-stone-900">{customer.name}</h3>
                {outstanding > 0 && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
                    Udhaar {formatCurrency(outstanding)}
                  </span>
                )}
                {customer.return_count > 0 && (
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-700">
                    {customer.return_count} returns
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-stone-500 flex-wrap">
                <Phone size={11} />
                <span>{customer.phone}</span>
                {customer.whatsapp_opted_in && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">WhatsApp</span>
                )}
                <span>Orders {customer.order_count || 0}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-lg font-black text-stone-900">{formatCurrency(displaySpend)}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Net Spend</div>
            </div>
            {expanded ? <ChevronUp size={16} className="text-stone-400" /> : <ChevronDown size={16} className="text-stone-400" />}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {topCats.map((cat) => (
            <span key={cat} className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${getCategoryColor(cat)}`}>
              {cat}
            </span>
          ))}
        </div>
      </button>

      {expanded && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="border-t border-black/5 px-5 pb-5">
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <ShoppingBag size={14} className="text-stone-500" />
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Purchase History</span>
                </div>
                <div className="space-y-2">
                  {(customer.purchase_history || []).slice().reverse().slice(0, 6).map((item, index) => (
                    <div key={`${item.product}-${index}`} className="flex items-center justify-between rounded-xl border border-black/5 bg-white/70 px-3 py-2.5">
                      <div>
                        <div className="text-sm font-semibold text-stone-900">{item.product}</div>
                        <div className="mt-0.5 text-[10px] text-stone-500">
                          Qty {item.quantity} | {formatDate(item.timestamp)}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-stone-800">{formatCurrency(item.price * item.quantity)}</div>
                    </div>
                  ))}
                  {(customer.purchase_history || []).length === 0 && (
                    <div className="rounded-xl border border-dashed border-black/10 bg-white/60 p-4 text-center text-xs text-stone-500">
                      No purchase history yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white/75 p-4">
                <div className="flex items-center gap-2">
                  <RotateCcw size={14} className="text-rose-600" />
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Returns Snapshot</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Returns</div>
                    <div className="mt-1 text-xl font-black text-stone-900">{customer.return_count || 0}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Refunded</div>
                    <div className="mt-1 text-xl font-black text-rose-700">{formatCurrency(customer.returned_amount)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Last Return</div>
                    <div className="mt-1 text-sm font-bold text-stone-800">{formatDate(customer.last_return_at)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Star size={14} className="text-amber-500" />
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Personalized Picks</span>
                </div>
                {recs.length > 0 ? (
                  <div className="space-y-2">
                    {recs.map((rec, index) => (
                      <div key={`${rec.product}-${index}`} className="flex items-center justify-between rounded-xl border border-dashed border-teal-300/50 bg-teal-50/50 px-3 py-2.5">
                        <div>
                          <div className="text-sm font-semibold text-stone-900">{rec.product}</div>
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-teal-700">
                            <TrendingUp size={10} />
                            {rec.reason}
                          </div>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${getCategoryColor(rec.category)}`}>{rec.category}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-black/10 bg-white/60 p-4 text-center text-xs text-stone-500">
                    Not enough data for recommendations yet.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-black/5 bg-white/75 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Wallet size={14} className="text-amber-600" />
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Udhaar Ledger</span>
                  </div>
                  {ledger && outstanding > 0 && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onSendReminder();
                      }}
                      disabled={sendingReminder}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                    >
                      <Send size={10} />
                      {sendingReminder ? 'Sending...' : 'WhatsApp reminder'}
                    </button>
                  )}
                </div>

                {ledger ? (
                  <>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Outstanding</div>
                        <div className="mt-1 text-xl font-black text-amber-700">{formatCurrency(outstanding)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Total Credit</div>
                        <div className="mt-1 text-xl font-black text-stone-900">{formatCurrency(ledger.total_credit)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Last Reminder</div>
                        <div className="mt-1 text-sm font-bold text-stone-800">{ledger.last_reminder_sent || 'Not sent'}</div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {(ledger.entries || []).slice().reverse().slice(0, 5).map((entry, index) => (
                        <div key={`${entry.date}-${entry.type}-${index}`} className="flex items-center justify-between rounded-xl border border-black/5 bg-stone-50 px-3 py-2.5">
                          <div>
                            <div className="text-sm font-semibold text-stone-900 capitalize">{entry.type}</div>
                            <div className="mt-0.5 text-[10px] text-stone-500">{entry.note || entry.date}</div>
                          </div>
                          <div className={`text-sm font-black ${entry.type === 'payment' ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {entry.type === 'payment' ? '-' : '+'} {formatCurrency(entry.amount)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {outstanding > 0 && (
                      <div className="mt-4 grid gap-3 md:grid-cols-[120px_1fr_auto]">
                        <input
                          type="number"
                          min="1"
                          max={outstanding}
                          value={paymentDraft.amount}
                          onChange={(event) => onPaymentDraftChange('amount', event.target.value)}
                          placeholder="Amount"
                          className="rounded-xl border border-black/10 bg-white/90 px-3 py-2.5 text-sm text-stone-900 focus:border-teal-600/50 focus:outline-none"
                        />
                        <input
                          type="text"
                          value={paymentDraft.note}
                          onChange={(event) => onPaymentDraftChange('note', event.target.value)}
                          placeholder="Note, e.g. cash at counter"
                          className="rounded-xl border border-black/10 bg-white/90 px-3 py-2.5 text-sm text-stone-900 focus:border-teal-600/50 focus:outline-none"
                        />
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onPaymentSubmit();
                          }}
                          disabled={!canPay || processingPayment}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
                        >
                          <Banknote size={14} />
                          {processingPayment ? 'Saving...' : 'Record payment'}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-black/10 bg-white/60 p-4 text-center text-xs text-stone-500">
                    No active udhaar ledger for this customer.
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-black/5 bg-white/70 p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Last Offer Sent</div>
                <div className="mt-1 flex items-center gap-2">
                  <Tag size={12} className="text-amber-600" />
                  <span className="text-sm font-semibold text-stone-800">{customer.last_offer_category} category</span>
                </div>
                <div className="mt-1 text-[10px] text-stone-500">{formatDate(customer.last_offer_timestamp)}</div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default function CustomersTab({ refreshTick = 0 }) {
  const [customers, setCustomers] = useState([]);
  const [udhaar, setUdhaar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [processingId, setProcessingId] = useState(null);
  const [sendingReminderId, setSendingReminderId] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [customersRes, udhaarRes] = await Promise.all([apiFetch('/api/customers'), apiFetch('/api/udhaar')]);
      const [customersData, udhaarData] = await Promise.all([customersRes.json(), udhaarRes.json()]);
      setCustomers(Array.isArray(customersData) ? customersData : []);
      setUdhaar(Array.isArray(udhaarData) ? udhaarData : udhaarData?.ledgers || []);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshTick]);

  const udhaarMap = useMemo(() => {
    const map = {};
    for (const ledger of udhaar) map[ledger.customer_id] = ledger;
    return map;
  }, [udhaar]);

  const filtered = customers.filter((customer) =>
    customer.name.toLowerCase().includes(search.toLowerCase()) ||
    customer.phone.includes(search) ||
    customer.customer_id.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => (b.net_spend || getFallbackSpend(b)) - (a.net_spend || getFallbackSpend(a)));

  const updateDraft = (customerId, field, value) => {
    setPaymentDrafts((prev) => ({
      ...prev,
      [customerId]: { ...(prev[customerId] || { amount: '', note: '' }), [field]: value },
    }));
  };

  const handlePayment = async (customer) => {
    const draft = paymentDrafts[customer.customer_id] || { amount: '', note: '' };
    if (!customer.udhaar_id || !draft.amount) return;
    setProcessingId(customer.customer_id);
    try {
      await apiFetch('/api/udhaar/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          udhaar_id: customer.udhaar_id,
          amount: Number(draft.amount),
          note: draft.note || 'Recorded from customer dashboard',
        }),
      });
      setPaymentDrafts((prev) => ({ ...prev, [customer.customer_id]: { amount: '', note: '' } }));
      await fetchData();
      window.dispatchEvent(new Event('retailos:data-changed'));
    } catch (err) {
      console.error('Failed to record payment:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReminder = async (customer) => {
    if (!customer.udhaar_id) return;
    setSendingReminderId(customer.customer_id);
    try {
      const response = await apiFetch(`/api/udhaar/${customer.udhaar_id}/remind`, { method: 'POST' });
      const data = await response.json();
      if (data?.whatsapp_link) {
        window.open(data.whatsapp_link, '_blank', 'noopener,noreferrer');
      }
      await fetchData();
      window.dispatchEvent(new Event('retailos:data-changed'));
    } catch (err) {
      console.error('Failed to send reminder:', err);
    } finally {
      setSendingReminderId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-300 border-t-teal-700" />
      </div>
    );
  }

  const totalNetSpend = customers.reduce((sum, customer) => sum + (customer.net_spend || getFallbackSpend(customer)), 0);
  const totalOutstanding = customers.reduce((sum, customer) => sum + (customer.udhaar_balance || 0), 0);
  const activeCreditCustomers = customers.filter((customer) => (customer.udhaar_balance || 0) > 0).length;
  const whatsappCount = customers.filter((customer) => customer.whatsapp_opted_in).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
            <User size={18} />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-stone-900">{customers.length} Customers</h2>
            <p className="text-xs text-stone-500">Customer history, udhaar tracking, returns visibility, and WhatsApp follow-up.</p>
          </div>
        </div>
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, phone, or ID..."
            className="w-full rounded-2xl border border-black/10 bg-white/85 py-3 pl-10 pr-4 text-sm text-stone-900 placeholder:text-stone-400 focus:border-teal-600/50 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Net Customer Revenue', value: formatCurrency(totalNetSpend), color: 'text-emerald-700', bg: 'bg-emerald-100' },
          { label: 'Outstanding Udhaar', value: formatCurrency(totalOutstanding), color: 'text-amber-700', bg: 'bg-amber-100' },
          { label: 'Active Credit Accounts', value: activeCreditCustomers, color: 'text-stone-900', bg: 'bg-stone-200' },
          { label: 'WhatsApp Ready', value: `${whatsappCount} / ${customers.length}`, color: 'text-teal-700', bg: 'bg-teal-100' },
        ].map((card) => (
          <div key={card.label} className="rounded-[24px] border border-black/5 bg-[rgba(255,252,247,0.72)] p-5 shadow-[0_14px_35px_rgba(0,0,0,0.04)]">
            <div className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${card.bg} ${card.color}`}>
              {card.label}
            </div>
            <div className={`mt-3 text-2xl font-black tracking-tight ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {sorted.map((customer) => (
          <CustomerCard
            key={customer.customer_id}
            customer={customer}
            ledger={udhaarMap[customer.customer_id]}
            allCustomers={customers}
            expanded={expandedId === customer.customer_id}
            onToggle={() => setExpandedId(expandedId === customer.customer_id ? null : customer.customer_id)}
            paymentDraft={paymentDrafts[customer.customer_id] || { amount: '', note: '' }}
            onPaymentDraftChange={(field, value) => updateDraft(customer.customer_id, field, value)}
            onPaymentSubmit={() => handlePayment(customer)}
            onSendReminder={() => handleReminder(customer)}
            processingPayment={processingId === customer.customer_id}
            sendingReminder={sendingReminderId === customer.customer_id}
          />
        ))}

        {sorted.length === 0 && (
          <div className="rounded-[28px] border border-dashed border-black/10 bg-white/70 p-10 text-center text-stone-500">
            No customers match your search.
          </div>
        )}
      </div>
    </div>
  );
}
