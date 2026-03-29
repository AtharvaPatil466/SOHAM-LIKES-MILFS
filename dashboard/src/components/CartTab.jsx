import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Mic,
  Send,
  UserRound,
  Wallet,
} from 'lucide-react';

const CATEGORY_FILTERS = ['All', 'Dairy', 'Frozen', 'Snacks', 'Beverages', 'Grocery', 'Cleaning', 'Personal Care', 'Other'];
const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Udhaar'];

function formatCurrency(value) {
  return `Rs ${Math.round(value || 0).toLocaleString()}`;
}

function getFallbackImage(productName) {
  return `https://source.unsplash.com/300x200/?${encodeURIComponent(productName)},food`;
}

function ProductCard({ item, quantityToAdd, onAdjustQuantity, onAddToCart }) {
  const [imageSrc, setImageSrc] = useState(item.image_url || getFallbackImage(item.product_name));
  const [loaded, setLoaded] = useState(false);
  const outOfStock = item.current_stock === 0;

  useEffect(() => {
    setLoaded(false);
    setImageSrc(item.image_url || getFallbackImage(item.product_name));
  }, [item.image_url, item.product_name]);

  const handleImageError = () => {
    const fallback = getFallbackImage(item.product_name);
    if (imageSrc !== fallback) {
      setLoaded(false);
      setImageSrc(fallback);
    } else {
      setLoaded(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`overflow-hidden rounded-[28px] border border-black/5 bg-[rgba(255,252,247,0.92)] shadow-[0_18px_45px_rgba(0,0,0,0.05)] transition-all ${outOfStock ? 'opacity-55 grayscale-[0.2]' : 'hover:bg-white'}`}
    >
      <div className="relative h-40 overflow-hidden border-b border-black/5 bg-stone-100">
        {!loaded && <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-stone-200 via-stone-100 to-stone-200" />}
        <img
          src={imageSrc}
          alt={item.product_name}
          className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={handleImageError}
        />
      </div>

      <div className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">{item.category}</div>
            <h3 className="mt-1 text-base font-bold leading-tight text-stone-900">{item.product_name}</h3>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${outOfStock ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-600'}`}>
            Stock {item.current_stock}
          </span>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <div className="text-xl font-black text-stone-900">{formatCurrency(item.unit_price)}</div>
          <div className="text-xs text-stone-500">{item.sku}</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center overflow-hidden rounded-xl border border-black/10 bg-white">
            <button
              onClick={() => onAdjustQuantity(item.sku, -1)}
              className="px-3 py-2 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
              disabled={quantityToAdd <= 1}
            >
              <Minus size={14} />
            </button>
            <span className="min-w-[2.5rem] text-center text-sm font-bold text-stone-900">{quantityToAdd}</span>
            <button
              onClick={() => onAdjustQuantity(item.sku, 1)}
              className="px-3 py-2 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
              disabled={quantityToAdd >= Math.max(item.current_stock, 1)}
            >
              <Plus size={14} />
            </button>
          </div>

          <button
            onClick={() => onAddToCart(item, quantityToAdd)}
            disabled={outOfStock}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition-colors ${outOfStock ? 'cursor-not-allowed bg-stone-200 text-stone-400' : 'bg-teal-700 text-white hover:bg-teal-600'}`}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function CartTab({ refreshTick = 0 }) {
  const [inventory, setInventory] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState([]);
  const [addQuantities, setAddQuantities] = useState({});
  const [submittingSale, setSubmittingSale] = useState(false);
  const [toast, setToast] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [voiceText, setVoiceText] = useState('');
  const [voiceResult, setVoiceResult] = useState(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [listening, setListening] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [inventoryRes, customersRes] = await Promise.all([fetch('/api/inventory'), fetch('/api/customers')]);
      const [inventoryData, customersData] = await Promise.all([inventoryRes.json(), customersRes.json()]);
      setInventory(inventoryData || []);
      setCustomers(customersData || []);
      setAddQuantities((prev) => {
        const next = { ...prev };
        for (const item of inventoryData || []) {
          if (!next[item.sku]) next[item.sku] = 1;
        }
        return next;
      });
    } catch (error) {
      console.error('Failed to fetch cart data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshTick]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const customer = customers.find((entry) => entry.customer_id === selectedCustomerId);
    if (!customer) return;
    setCustomerName(customer.name);
    setPhone(customer.phone);
  }, [selectedCustomerId, customers]);

  useEffect(() => {
    const handleAssistantCartDraft = (event) => {
      const draftItems = event.detail?.items || [];
      if (!draftItems.length) return;

      let addedCount = 0;
      for (const draftItem of draftItems) {
        const match = inventory.find((entry) => entry.sku === draftItem.sku);
        if (!match || Number(match.current_stock || 0) <= 0) continue;
        addToCart(match, Math.max(1, Number(draftItem.qty || 1)));
        addedCount += 1;
      }

      if (addedCount > 0) {
        const source = event.detail?.source ? ` from ${event.detail.source}` : '';
        setToast(`Added ${addedCount} item${addedCount === 1 ? '' : 's'}${source}.`);
      } else {
        setToast('No requested assistant items are in stock right now.');
      }
    };

    window.addEventListener('retailos:assistant-cart-draft', handleAssistantCartDraft);
    return () => window.removeEventListener('retailos:assistant-cart-draft', handleAssistantCartDraft);
  }, [inventory]);

  const filtered = useMemo(() => {
    return inventory.filter((item) => {
      const matchesSearch =
        item.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = category === 'All' || item.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [inventory, searchTerm, category]);

  const selectedCustomer = customers.find((entry) => entry.customer_id === selectedCustomerId);
  const cartSubtotal = cart.reduce((sum, line) => sum + line.unit_price * line.qty, 0);

  const adjustAddQuantity = (sku, delta) => {
    const item = inventory.find((entry) => entry.sku === sku);
    const max = Math.max(item?.current_stock || 1, 1);
    setAddQuantities((prev) => {
      const current = prev[sku] || 1;
      const next = Math.min(max, Math.max(1, current + delta));
      return { ...prev, [sku]: next };
    });
  };

  const addToCart = (item, qty) => {
    if (!qty || item.current_stock === 0) return;
    setCart((prev) => {
      const existing = prev.find((line) => line.sku === item.sku);
      const nextQty = Math.min(item.current_stock, (existing?.qty || 0) + qty);
      if (existing) {
        return prev.map((line) => (line.sku === item.sku ? { ...line, qty: nextQty } : line));
      }
      return [
        ...prev,
        {
          sku: item.sku,
          product_name: item.product_name,
          unit_price: item.unit_price,
          qty: Math.min(item.current_stock, qty),
        },
      ];
    });
    setAddQuantities((prev) => ({ ...prev, [item.sku]: 1 }));
  };

  const adjustCartQty = (sku, delta) => {
    const stockItem = inventory.find((item) => item.sku === sku);
    const max = stockItem?.current_stock || 0;
    setCart((prev) => prev.flatMap((line) => {
      if (line.sku !== sku) return [line];
      const nextQty = Math.max(0, Math.min(max, line.qty + delta));
      return nextQty === 0 ? [] : [{ ...line, qty: nextQty }];
    }));
  };

  const removeCartItem = (sku) => {
    setCart((prev) => prev.filter((line) => line.sku !== sku));
  };

  const recordSale = async () => {
    if (!cart.length) return;
    if (paymentMethod === 'Udhaar' && !customerName.trim()) {
      setToast('Select or enter a customer before recording udhaar.');
      return;
    }

    setSubmittingSale(true);
    try {
      const response = await fetch('/api/inventory/sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((line) => ({ sku: line.sku, qty: line.qty })),
          customer_id: selectedCustomerId || null,
          customer_name: customerName || null,
          phone: phone || null,
          payment_method: paymentMethod,
        }),
      });
      if (!response.ok) throw new Error('Failed to record sale');
      const result = await response.json();
      setCart([]);
      setToast(`Sale recorded: ${formatCurrency(result.total_amount)}${paymentMethod === 'Udhaar' ? ' on udhaar' : ''}`);
      await fetchData();
      window.dispatchEvent(new Event('retailos:data-changed'));
    } catch (error) {
      console.error('Failed to record sale:', error);
    } finally {
      setSubmittingSale(false);
    }
  };

  const handleVoiceAction = async () => {
    if (!voiceText.trim()) return;
    setVoiceBusy(true);
    try {
      const response = await fetch('/api/voice/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: voiceText }),
      });
      const data = await response.json();
      setVoiceResult(data);

      if (data.action === 'sale_ready') {
        const match = inventory.find((item) => item.sku === data.sku);
        if (match) addToCart(match, data.qty || 1);
        if (data.customer) {
          const customer = customers.find((entry) => entry.name.toLowerCase().includes(data.customer.toLowerCase()));
          if (customer) setSelectedCustomerId(customer.customer_id);
          else setCustomerName(data.customer);
        }
        setToast(data.message || 'Sale draft added to cart.');
      } else if (data.action === 'stock_update') {
        setToast(data.message || 'Stock updated from voice command.');
        await fetchData();
        window.dispatchEvent(new Event('retailos:data-changed'));
      } else if (data.message) {
        setToast(data.message);
      }
    } catch (error) {
      console.error('Failed to process voice command:', error);
    } finally {
      setVoiceBusy(false);
    }
  };

  const startListening = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setToast('Speech input is not supported in this browser.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      setVoiceText(transcript);
    };
    recognition.start();
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1 max-w-xl">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search products by name or SKU..."
                className="w-full rounded-2xl border border-black/10 bg-white/85 py-3 pl-10 pr-4 text-sm text-stone-900 placeholder:text-stone-400 focus:border-teal-600/50 focus:outline-none"
              />
            </div>
            <button
              onClick={fetchData}
              className="rounded-2xl border border-black/10 bg-white/85 px-4 py-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-white"
            >
              Refresh Products
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide lg:flex-wrap">
            {CATEGORY_FILTERS.map((filter) => (
              <button
                key={filter}
                onClick={() => setCategory(filter)}
                className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                  category === filter
                    ? 'border-teal-700 bg-teal-700 text-white'
                    : 'border-black/10 bg-white/75 text-stone-600 hover:bg-white hover:text-stone-900'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((item) => (
              <ProductCard
                key={item.sku}
                item={item}
                quantityToAdd={addQuantities[item.sku] || 1}
                onAdjustQuantity={adjustAddQuantity}
                onAddToCart={addToCart}
              />
            ))}
            {!loading && filtered.length === 0 && (
              <div className="col-span-full rounded-[28px] border border-dashed border-black/10 bg-white/70 p-10 text-center text-stone-500">
                No products match this filter.
              </div>
            )}
          </div>
        </section>

        <aside className="min-w-0 space-y-5 xl:sticky xl:top-28 xl:self-start">
          <div className="rounded-[30px] border border-black/5 bg-[rgba(255,252,247,0.94)] p-5 shadow-[0_20px_55px_rgba(0,0,0,0.06)]">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
                <ShoppingCart size={20} />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Smart Checkout</div>
                <h3 className="font-display text-2xl font-bold text-stone-900">Counter Sale</h3>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-stone-500">Customer</span>
                  <select
                    value={selectedCustomerId}
                    onChange={(event) => setSelectedCustomerId(event.target.value)}
                    className="w-full rounded-xl border border-black/10 bg-white/90 px-3 py-2.5 text-sm text-stone-900 focus:border-teal-600/50 focus:outline-none"
                  >
                    <option value="">Walk-in customer</option>
                    {customers.map((customer) => (
                      <option key={customer.customer_id} value={customer.customer_id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-stone-500">Payment</span>
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    className="w-full rounded-xl border border-black/10 bg-white/90 px-3 py-2.5 text-sm text-stone-900 focus:border-teal-600/50 focus:outline-none"
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-stone-500">Customer Name</span>
                <input
                  type="text"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Walk-in or named customer"
                  className="w-full rounded-xl border border-black/10 bg-white/90 px-3 py-2.5 text-sm text-stone-900 focus:border-teal-600/50 focus:outline-none"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-stone-500">Phone</span>
                <input
                  type="text"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+91..."
                  className="w-full rounded-xl border border-black/10 bg-white/90 px-3 py-2.5 text-sm text-stone-900 focus:border-teal-600/50 focus:outline-none"
                />
              </label>

              {selectedCustomer ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                  <div className="flex items-center gap-2">
                    <UserRound size={14} className="text-amber-700" />
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Customer credit context</span>
                  </div>
                  <div className="mt-2 text-sm text-stone-700">
                    Current udhaar: <span className="font-black text-stone-900">{formatCurrency(selectedCustomer.udhaar_balance)}</span>
                  </div>
                  <div className="mt-1 text-xs text-stone-500">
                    Returns logged: {selectedCustomer.return_count || 0} | Last reminder: {selectedCustomer.last_reminder_sent || 'Not sent'}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              {cart.length === 0 && (
                <div className="rounded-2xl border border-dashed border-black/10 bg-white/60 p-6 text-center text-sm text-stone-500">
                  Add products from the browser to start a sale.
                </div>
              )}

              {cart.map((line) => (
                <div key={line.sku} className="rounded-2xl border border-black/5 bg-white/85 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-stone-900">{line.product_name}</div>
                      <div className="mt-1 text-xs text-stone-500">{formatCurrency(line.unit_price)} each</div>
                    </div>
                    <button
                      onClick={() => removeCartItem(line.sku)}
                      className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-700"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center overflow-hidden rounded-xl border border-black/10 bg-white">
                      <button onClick={() => adjustCartQty(line.sku, -1)} className="px-3 py-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900">
                        <Minus size={14} />
                      </button>
                      <span className="min-w-[2.5rem] text-center text-sm font-bold text-stone-900">{line.qty}</span>
                      <button onClick={() => adjustCartQty(line.sku, 1)} className="px-3 py-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900">
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="text-sm font-black text-stone-900">{formatCurrency(line.qty * line.unit_price)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 border-t border-black/5 pt-5">
              <div className="mb-4 flex items-center justify-between text-sm">
                <span className="font-semibold text-stone-500">Subtotal</span>
                <span className="text-xl font-black text-stone-900">{formatCurrency(cartSubtotal)}</span>
              </div>
              <button
                onClick={recordSale}
                disabled={!cart.length || submittingSale}
                className="w-full rounded-2xl bg-teal-700 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {submittingSale ? 'Recording Sale...' : `Record Sale${paymentMethod === 'Udhaar' ? ' to Udhaar' : ''}`}
              </button>
            </div>
          </div>

          <div className="rounded-[30px] border border-black/5 bg-stone-900 p-5 text-stone-50 shadow-[0_20px_55px_rgba(0,0,0,0.12)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Voice Input Layer</div>
                <h3 className="font-display mt-1 text-2xl font-bold">Speak or type a command</h3>
              </div>
              <button
                onClick={startListening}
                className={`rounded-full p-3 transition-colors ${listening ? 'bg-rose-500 text-white' : 'bg-white/10 text-white hover:bg-white/15'}`}
              >
                <Mic size={16} />
              </button>
            </div>

            <textarea
              value={voiceText}
              onChange={(event) => setVoiceText(event.target.value)}
              placeholder='Try "add 20 units of Amul butter" or "sell 3 Maggi to Rahul"'
              className="h-28 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-stone-400 focus:border-teal-400/60 focus:outline-none"
            />

            <button
              onClick={handleVoiceAction}
              disabled={!voiceText.trim() || voiceBusy}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-400 disabled:opacity-50"
            >
              <Send size={14} />
              {voiceBusy ? 'Processing...' : 'Run Voice Command'}
            </button>

            <div className="mt-4 rounded-2xl bg-white/5 p-4">
              <div className="flex items-center gap-2">
                <Wallet size={14} className="text-amber-300" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Command Result</span>
              </div>
              <div className="mt-3 text-sm leading-relaxed text-stone-200">
                {voiceResult?.message || 'Voice actions can restock stock, draft a sale, or capture delivery feedback.'}
              </div>
              {voiceResult?.action && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-stone-300">
                  Action: {voiceResult.action}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-700 shadow-[0_20px_50px_rgba(0,0,0,0.12)]">
          {toast}
        </div>
      )}
    </div>
  );
}
