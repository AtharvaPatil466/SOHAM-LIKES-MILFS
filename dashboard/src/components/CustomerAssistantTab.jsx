import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  ChefHat,
  Clock3,
  Copy,
  Languages,
  MapPinned,
  MessageCircle,
  Mic,
  Package,
  QrCode,
  Send,
  Settings2,
  ShoppingCart,
  Sparkles,
  Store,
  Wand2,
} from 'lucide-react';

const SAMPLE_PROMPTS = [
  'Where is Amul butter?',
  'Do you have Maggi?',
  'What time do you close?',
  'I want to make spaghetti tomato',
  'chai ke liye kya chahiye',
];

function formatStock(value) {
  const count = Number(value || 0);
  return `${count} unit${count === 1 ? '' : 's'}`;
}

function JsonEditor({ label, value, onChange, rows = 6 }) {
  return (
    <label className="space-y-1.5">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="w-full rounded-2xl border border-black/10 bg-white/90 px-3 py-3 text-xs font-medium text-stone-800 focus:border-teal-600/50 focus:outline-none"
      />
    </label>
  );
}

function Pill({ children, tone = 'stone' }) {
  const styles = {
    stone: 'bg-stone-100 text-stone-600',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    violet: 'bg-violet-100 text-violet-700',
    teal: 'bg-teal-100 text-teal-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${styles[tone] || styles.stone}`}>
      {children}
    </span>
  );
}

function IngredientCard({ entry, tone = 'emerald' }) {
  const boxStyles = {
    emerald: 'border-emerald-200 bg-emerald-50/80',
    amber: 'border-amber-200 bg-amber-50/80',
    red: 'border-red-200 bg-red-50/80',
  };

  return (
    <div className={`rounded-2xl border p-4 ${boxStyles[tone] || boxStyles.emerald}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-stone-900">{entry.ingredient}</div>
          <div className="mt-1 text-xs text-stone-500">
            {entry.matched_product || entry.category_hint || 'Not mapped to a store item'}
          </div>
        </div>
        {entry.is_optional ? <Pill tone="stone">Optional</Pill> : null}
      </div>

      {entry.sku ? (
        <div className="mt-3 grid gap-2 text-xs text-stone-600 sm:grid-cols-2">
          <div>
            <span className="font-semibold text-stone-800">SKU:</span> {entry.sku}
          </div>
          <div>
            <span className="font-semibold text-stone-800">Stock:</span> {formatStock(entry.current_stock)}
          </div>
          {entry.zone_name ? (
            <div>
              <span className="font-semibold text-stone-800">Zone:</span> {entry.zone_name} ({entry.zone_id})
            </div>
          ) : null}
          {entry.shelf_name || entry.shelf_level ? (
            <div>
              <span className="font-semibold text-stone-800">Shelf:</span> {entry.shelf_name || 'Shelf'}{entry.shelf_level ? ` · ${String(entry.shelf_level).replaceAll('_', ' ')}` : ''}
            </div>
          ) : null}
        </div>
      ) : null}

      {entry.substitutes?.length ? (
        <div className="mt-3 rounded-2xl border border-dashed border-black/10 bg-white/70 p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Suggested swaps</div>
          <div className="mt-2 space-y-2">
            {entry.substitutes.map((substitute) => (
              <div key={`${entry.ingredient}-${substitute.sku}`} className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-700">
                <div className="font-semibold text-stone-900">{substitute.label}</div>
                <div>{substitute.reason}</div>
                <div className="mt-1 text-stone-500">
                  {substitute.sku} · {formatStock(substitute.current_stock)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, tone = 'teal' }) {
  const styles = {
    teal: 'bg-teal-100 text-teal-700',
    amber: 'bg-amber-100 text-amber-700',
    violet: 'bg-violet-100 text-violet-700',
    red: 'bg-red-100 text-red-700',
  };
  return (
    <div className="rounded-[24px] border border-black/5 bg-[rgba(255,252,247,0.88)] p-5 shadow-[0_14px_35px_rgba(0,0,0,0.04)]">
      <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl ${styles[tone] || styles.teal}`}>
        <Icon size={18} />
      </div>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-stone-900">{value}</div>
    </div>
  );
}

export default function CustomerAssistantTab({ kioskMode = false }) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [storeProfile, setStoreProfile] = useState(null);
  const [assistantConfig, setAssistantConfig] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [toast, setToast] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [qrLoadFailed, setQrLoadFailed] = useState(false);
  const [profileDraft, setProfileDraft] = useState(null);
  const [configDraft, setConfigDraft] = useState(null);
  const [hoursJson, setHoursJson] = useState('{}');
  const [recipeBundlesJson, setRecipeBundlesJson] = useState('[]');
  const [substitutionRulesJson, setSubstitutionRulesJson] = useState('{}');
  const [clarificationRulesJson, setClarificationRulesJson] = useState('[]');

  const fetchBootstrap = async () => {
    try {
      const [profileRes, configRes, analyticsRes] = await Promise.all([
        apiFetch('/api/store-profile'),
        apiFetch('/api/customer-assistant/config'),
        apiFetch('/api/customer-assistant/analytics'),
      ]);
      const [profileData, configData, analyticsData] = await Promise.all([
        profileRes.json(),
        configRes.json(),
        analyticsRes.json(),
      ]);

      setStoreProfile(profileData);
      setProfileDraft(profileData);
      setHoursJson(JSON.stringify(profileData.hours || {}, null, 2));
      setAssistantConfig(configData);
      setConfigDraft(configData);
      setRecipeBundlesJson(JSON.stringify(configData.recipe_bundles || [], null, 2));
      setSubstitutionRulesJson(JSON.stringify(configData.substitution_rules || {}, null, 2));
      setClarificationRulesJson(JSON.stringify(configData.clarification_rules || [], null, 2));
      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Failed to fetch customer assistant data:', error);
    }
  };

  useEffect(() => {
    fetchBootstrap();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const voiceLanguage = configDraft?.default_voice_language || assistantConfig?.default_voice_language || 'en-IN';
  const kioskUrl = `${window.location.origin}${window.location.pathname}?mode=kiosk`;
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(kioskUrl)}&size=220`;
  const latestAssistantResponse = [...messages].reverse().find((entry) => entry.role === 'assistant')?.response || null;
  const bundleRecommendations = latestAssistantResponse?.bundle_recommendations || assistantConfig?.recipe_bundles || [];
  const availableBundles = useMemo(
    () => (bundleRecommendations || []).filter((bundle) => bundle.all_available),
    [bundleRecommendations],
  );

  const submitQuery = async (rawText = query) => {
    const text = rawText.trim();
    if (!text) return;

    const userMessage = { id: `user-${Date.now()}`, role: 'user', text };
    setMessages((prev) => [...prev, userMessage]);
    setQuery('');
    setLoading(true);

    try {
      const response = await apiFetch('/api/customer-assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      setMessages((prev) => [...prev, { id: `assistant-${Date.now()}`, role: 'assistant', text: data.answer, response: data, sourceQuery: text }]);
      apiFetch('/api/customer-assistant/analytics')
        .then((res) => res.json())
        .then((analyticsData) => setAnalytics(analyticsData))
        .catch(() => {});
    } catch (error) {
      console.error('Customer assistant query failed:', error);
      setMessages((prev) => [...prev, { id: `assistant-${Date.now()}`, role: 'assistant', text: 'Something went wrong while checking the store data.', response: { intent: 'error' }, sourceQuery: text }]);
    } finally {
      setLoading(false);
    }
  };

  const startListening = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setToast('Speech input is not supported in this browser.');
      return;
    }

    const recognition = new Recognition();
    recognition.lang = voiceLanguage;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      setQuery(transcript);
    };
    recognition.start();
  };

  const copyText = async (value, successLabel) => {
    try {
      await navigator.clipboard.writeText(value);
      setToast(successLabel);
    } catch {
      setToast('Could not copy automatically.');
    }
  };

  const saveSettings = async () => {
    if (!profileDraft || !configDraft) return;
    let parsedBundles;
    let parsedSubstitutions;
    let parsedClarifications;
    let parsedHours;

    try {
      parsedHours = JSON.parse(hoursJson);
      parsedBundles = JSON.parse(recipeBundlesJson);
      parsedSubstitutions = JSON.parse(substitutionRulesJson);
      parsedClarifications = JSON.parse(clarificationRulesJson);
    } catch {
      setToast('Fix the JSON fields before saving settings.');
      return;
    }

    setSavingSettings(true);
    try {
      const nextConfig = {
        ...configDraft,
        recipe_bundles: parsedBundles,
        substitution_rules: parsedSubstitutions,
        clarification_rules: parsedClarifications,
      };
      const nextProfile = {
        ...profileDraft,
        hours: parsedHours,
        phone: profileDraft.phone || configDraft.whatsapp_number || '',
      };

      const [profileRes, configRes] = await Promise.all([
        apiFetch('/api/store-profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextProfile),
        }),
        apiFetch('/api/customer-assistant/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextConfig),
        }),
      ]);

      const [profileData, configData] = await Promise.all([profileRes.json(), configRes.json()]);
      setStoreProfile(profileData);
      setAssistantConfig(configData);
      setConfigDraft(configData);
      setToast('Assistant settings saved.');
    } catch (error) {
      console.error('Failed to save assistant settings:', error);
      setToast('Could not save assistant settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const addRecipeItemsToCart = (response) => {
    const items = (response.ingredients_found || [])
      .filter((entry) => entry.sku && Number(entry.current_stock || 0) > 0)
      .map((entry) => ({ sku: entry.sku, qty: 1 }));

    if (!items.length) {
      setToast('No in-stock items from this recipe can be added right now.');
      return;
    }

    window.dispatchEvent(new CustomEvent('retailos:assistant-cart-draft', {
      detail: {
        items,
        source: response.dish_name || 'recipe assistant',
      },
    }));
    if (!kioskMode) {
      window.dispatchEvent(new CustomEvent('retailos:navigate', { detail: { tab: 'cart' } }));
    }
    setToast(`${items.length} item${items.length === 1 ? '' : 's'} sent to cart.`);
  };

  const addSingleProductToCart = (response) => {
    if (!response?.sku || Number(response.current_stock || 0) <= 0) {
      setToast('This item is not available to add right now.');
      return;
    }
    window.dispatchEvent(new CustomEvent('retailos:assistant-cart-draft', {
      detail: {
        items: [{ sku: response.sku, qty: 1 }],
        source: response.product || response.sku,
      },
    }));
    if (!kioskMode) {
      window.dispatchEvent(new CustomEvent('retailos:navigate', { detail: { tab: 'cart' } }));
    }
    setToast(`${response.product || 'Item'} added to cart.`);
  };

  const shareWhatsAppAnswer = async (message) => {
    const sourceQuery = message?.sourceQuery || query || latestAssistantResponse?.product || 'What time do you close?';
    try {
      const response = await apiFetch('/api/customer-assistant/whatsapp-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sourceQuery }),
      });
      const data = await response.json();
      window.open(data.whatsapp_link, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Failed to build WhatsApp link:', error);
      setToast('Could not open WhatsApp share.');
    }
  };

  const renderAssistantResponse = (message) => {
    const response = message.response || {};
    const intent = response.intent;

    return (
      <div className="space-y-4">
        <div className="rounded-[28px] border border-black/5 bg-[rgba(255,252,247,0.94)] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="teal">{String(intent || 'assistant').replaceAll('_', ' ')}</Pill>
            {response.availability_status === 'in_stock' ? <Pill tone="emerald">In stock</Pill> : null}
            {response.availability_status === 'out_of_stock' ? <Pill tone="red">Out of stock</Pill> : null}
            {response.availability_status === 'in_stock_unassigned' ? <Pill tone="amber">Shelf pending</Pill> : null}
            {response.substitute_count ? <Pill tone="violet">{response.substitute_count} swap ideas</Pill> : null}
          </div>

          <div className="mt-3 text-lg font-bold leading-snug text-stone-900">{message.text}</div>

          {response.product || response.dish_name ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {response.product ? (
                <div className="rounded-2xl border border-black/5 bg-white/85 p-4 text-sm text-stone-700">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Product</div>
                  <div className="mt-2 font-bold text-stone-900">{response.product}</div>
                  {response.sku ? <div className="mt-1 text-xs text-stone-500">{response.sku}</div> : null}
                </div>
              ) : null}
              {response.dish_name ? (
                <div className="rounded-2xl border border-black/5 bg-white/85 p-4 text-sm text-stone-700">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Recipe</div>
                  <div className="mt-2 font-bold text-stone-900">{response.dish_name}</div>
                  {response.recipe_notes ? <div className="mt-1 text-xs text-stone-500">{response.recipe_notes}</div> : null}
                </div>
              ) : null}
              {response.zone_name ? (
                <div className="rounded-2xl border border-black/5 bg-white/85 p-4 text-sm text-stone-700">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Location</div>
                  <div className="mt-2 font-bold text-stone-900">{response.zone_name} ({response.zone_id})</div>
                  <div className="mt-1 text-xs text-stone-500">
                    {response.shelf_name || 'Shelf'}{response.shelf_level ? ` · ${String(response.shelf_level).replaceAll('_', ' ')}` : ''}
                  </div>
                </div>
              ) : null}
              {response.today_hours ? (
                <div className="rounded-2xl border border-black/5 bg-white/85 p-4 text-sm text-stone-700">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Today</div>
                  <div className="mt-2 font-bold text-stone-900">{response.today_hours}</div>
                  <div className="mt-1 text-xs text-stone-500">{response.holiday_note}</div>
                </div>
              ) : null}
            </div>
          ) : null}

          {response.clarification_options?.length ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
              <div className="flex items-center gap-2 text-amber-700">
                <Wand2 size={15} />
                <span className="text-[10px] font-black uppercase tracking-[0.18em]">Need a quick clarification</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {response.clarification_options.map((option) => (
                  <button
                    key={option}
                    onClick={() => submitQuery(`I want to make ${option}`)}
                    className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {(response.intent === 'recipe_assistant' || response.substitutes?.length || response.availability_status === 'in_stock') ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {response.intent === 'recipe_assistant' ? (
                <button
                  onClick={() => addRecipeItemsToCart(response)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-teal-600"
                >
                  <ShoppingCart size={15} />
                  Add Available Ingredients to Cart
                </button>
              ) : null}
              {response.intent !== 'recipe_assistant' && response.availability_status === 'in_stock' ? (
                <button
                  onClick={() => addSingleProductToCart(response)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-teal-600"
                >
                  <ShoppingCart size={15} />
                  Add to Cart
                </button>
              ) : null}
              <button
                onClick={() => shareWhatsAppAnswer(message)}
                className="inline-flex items-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
              >
                <MessageCircle size={15} />
                Share on WhatsApp
              </button>
            </div>
          ) : null}
        </div>

        {response.intent === 'recipe_assistant' ? (
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-700" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Available now</span>
              </div>
              {(response.ingredients_found || []).length ? (
                response.ingredients_found.map((entry) => <IngredientCard key={`${message.id}-${entry.ingredient}`} entry={entry} tone="emerald" />)
              ) : (
                <div className="rounded-2xl border border-dashed border-black/10 bg-white/75 p-4 text-sm text-stone-500">No ingredients from this recipe are available right now.</div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-700" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Out of stock today</span>
              </div>
              {(response.ingredients_missing || []).length ? (
                response.ingredients_missing.map((entry) => <IngredientCard key={`${message.id}-${entry.ingredient}`} entry={entry} tone="amber" />)
              ) : (
                <div className="rounded-2xl border border-dashed border-black/10 bg-white/75 p-4 text-sm text-stone-500">Everything mapped here is currently in stock.</div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Package size={15} className="text-red-700" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Not carried</span>
              </div>
              {(response.ingredients_not_carried || []).length ? (
                response.ingredients_not_carried.map((entry) => <IngredientCard key={`${message.id}-${entry.ingredient}`} entry={entry} tone="red" />)
              ) : (
                <div className="rounded-2xl border border-dashed border-black/10 bg-white/75 p-4 text-sm text-stone-500">This store carries all the ingredients the assistant checked.</div>
              )}
            </div>
          </div>
        ) : null}

        {response.substitutes?.length ? (
          <div className="rounded-[28px] border border-black/5 bg-white/85 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-violet-700" />
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Suggested substitutes</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {response.substitutes.map((substitute) => (
                <div key={`${message.id}-${substitute.sku}`} className="rounded-2xl border border-violet-200 bg-violet-50/80 p-4 text-sm">
                  <div className="font-bold text-stone-900">{substitute.label}</div>
                  <div className="mt-1 text-stone-600">{substitute.reason}</div>
                  <div className="mt-2 text-xs text-stone-500">{substitute.sku} · {formatStock(substitute.current_stock)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {response.bundle_recommendations?.length ? (
          <div className="rounded-[28px] border border-black/5 bg-white/85 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-2">
              <ChefHat size={16} className="text-teal-700" />
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Inventory-aware recipe suggestions</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {response.bundle_recommendations.map((bundle) => (
                <button
                  key={`${message.id}-${bundle.id}`}
                  onClick={() => submitQuery(bundle.prompt)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${bundle.all_available ? 'border-emerald-200 bg-emerald-50/80 hover:bg-emerald-50' : 'border-black/10 bg-stone-50/90 hover:bg-white'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-stone-900">{bundle.name}</div>
                    <Pill tone={bundle.all_available ? 'emerald' : 'stone'}>{bundle.all_available ? 'Cookable now' : 'Check availability'}</Pill>
                  </div>
                  <div className="mt-1 text-xs text-stone-500">{bundle.description}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={`space-y-6 ${kioskMode ? 'mx-auto max-w-6xl pb-8' : ''}`}>
      {!kioskMode ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Bot} label="Total queries" value={analytics?.total_queries ?? 0} tone="teal" />
          <MetricCard icon={ChefHat} label="Top recipe asks" value={analytics?.top_recipes?.[0]?.dish_name || 'None yet'} tone="amber" />
          <MetricCard icon={AlertTriangle} label="Most missed item" value={analytics?.top_missing_items?.[0]?.ingredient || 'None yet'} tone="red" />
          <MetricCard icon={Languages} label="Voice language" value={voiceLanguage} tone="violet" />
        </div>
      ) : null}

      <div className={`grid gap-6 ${kioskMode ? 'xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]' : 'xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]'}`}>
        <section className="space-y-5">
          <div className={`rounded-[32px] border border-black/5 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.06)] ${kioskMode ? 'bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.18),_rgba(255,252,247,0.96)_60%)]' : 'bg-[rgba(255,252,247,0.94)]'}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Pill tone="teal">{kioskMode ? 'Customer kiosk' : 'Customer assistant'}</Pill>
                  <Pill tone="violet">{voiceLanguage}</Pill>
                </div>
                <h3 className="mt-3 font-display text-3xl font-bold tracking-tight text-stone-900">
                  {kioskMode ? `Ask ${storeProfile?.store_name || 'the store'} anything` : 'Search shelves, stock, recipes, and store info'}
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600">
                  Ask where a product is, whether it is in stock, what the store hours are, or what ingredients you need for a recipe. Recipe answers check live inventory and current shelf assignments before responding.
                </p>
              </div>

              {!kioskMode && storeProfile ? (
                <div className="rounded-3xl border border-black/5 bg-white/80 p-4 text-sm text-stone-700 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Store size={15} className="text-teal-700" />
                    <span className="font-bold text-stone-900">{storeProfile.store_name}</span>
                  </div>
                  <div className="mt-2">{storeProfile.address}</div>
                  <div className="mt-1">{storeProfile.phone}</div>
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {SAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => submitQuery(prompt)}
                  className="rounded-full border border-black/10 bg-white/85 px-4 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-white hover:text-stone-900"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-[28px] border border-black/5 bg-white/85 p-4 shadow-sm">
              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try: I want to make paneer butter masala"
                rows={kioskMode ? 4 : 3}
                className="w-full resize-none border-none bg-transparent text-base leading-relaxed text-stone-900 placeholder:text-stone-400 focus:outline-none"
              />
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <Languages size={14} />
                  English and Hinglish both work
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={startListening}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${listening ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-black/10 bg-white text-stone-700 hover:bg-stone-50'}`}
                  >
                    <Mic size={15} />
                    {listening ? 'Listening...' : 'Speak'}
                  </button>
                  <button
                    onClick={() => submitQuery()}
                    disabled={!query.trim() || loading}
                    className="inline-flex items-center gap-2 rounded-2xl bg-teal-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-teal-600 disabled:opacity-50"
                  >
                    <Send size={15} />
                    {loading ? 'Checking...' : 'Ask RetailOS'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {messages.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-black/10 bg-white/75 p-8 text-center">
              <Bot size={28} className="mx-auto text-teal-700" />
              <div className="mt-4 text-lg font-bold text-stone-900">The assistant is ready.</div>
              <div className="mt-2 text-sm text-stone-500">Start with a shelf lookup, a recipe question, or a Hinglish prompt like “amul butter kidhar hai”.</div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {message.role === 'user' ? (
                    <div className="ml-auto max-w-3xl rounded-[28px] bg-stone-900 px-5 py-4 text-sm font-medium text-white shadow-[0_18px_45px_rgba(0,0,0,0.14)]">
                      {message.text}
                    </div>
                  ) : (
                    renderAssistantResponse(message)
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-5 xl:sticky xl:top-28 xl:self-start">
          <div className="rounded-[30px] border border-black/5 bg-stone-900 p-5 text-stone-50 shadow-[0_20px_55px_rgba(0,0,0,0.14)]">
            <div className="flex items-center gap-2">
              <ChefHat size={16} className="text-amber-300" />
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Recipe bundles</span>
            </div>
            <div className="mt-4 space-y-3">
              {(assistantConfig?.recipe_bundles || []).map((bundle) => (
                <button
                  key={bundle.id}
                  onClick={() => submitQuery(bundle.prompt)}
                  className="w-full rounded-2xl bg-white/6 p-4 text-left transition-colors hover:bg-white/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold text-white">{bundle.name}</div>
                    {availableBundles.some((entry) => entry.id === bundle.id) ? <Pill tone="emerald">Ready now</Pill> : null}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-stone-300">{bundle.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-black/5 bg-[rgba(255,252,247,0.94)] p-5 shadow-[0_20px_55px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2">
              <QrCode size={16} className="text-teal-700" />
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Public kiosk + QR</span>
            </div>
            <div className="mt-3 text-sm leading-relaxed text-stone-600">
              Share a customer-safe version of the assistant on a phone or a kiosk screen.
            </div>
            <div className="mt-4 rounded-2xl border border-black/5 bg-white/85 p-3">
              {!qrLoadFailed ? (
                <img
                  src={qrUrl}
                  alt="Customer kiosk QR"
                  onError={() => setQrLoadFailed(true)}
                  className="mx-auto h-44 w-44 rounded-2xl border border-black/5 bg-white p-2"
                />
              ) : (
                <div className="mx-auto flex h-44 w-44 flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 bg-stone-50 p-5 text-center">
                  <QrCode size={26} className="text-stone-500" />
                  <div className="mt-3 text-xs font-semibold text-stone-600">
                    QR preview unavailable.
                  </div>
                  <div className="mt-1 text-[11px] text-stone-500">
                    The kiosk link below still works.
                  </div>
                </div>
              )}
              <div className="mt-3 rounded-2xl bg-stone-50 px-3 py-2 text-xs text-stone-600 break-all">{kioskUrl}</div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => copyText(kioskUrl, 'Kiosk link copied.')}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
              >
                <Copy size={14} />
                Copy Link
              </button>
              <button
                onClick={() => window.open(kioskUrl, '_blank', 'noopener,noreferrer')}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-teal-600"
              >
                <MapPinned size={14} />
                Open Kiosk
              </button>
            </div>
          </div>

          {!kioskMode ? (
            <>
              <div className="rounded-[30px] border border-black/5 bg-[rgba(255,252,247,0.94)] p-5 shadow-[0_20px_55px_rgba(0,0,0,0.06)]">
                <div className="flex items-center gap-2">
                  <BarChart3 size={16} className="text-violet-700" />
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Customer analytics</span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-black/5 bg-white/85 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Top queries</div>
                    <div className="mt-3 space-y-2">
                      {(analytics?.top_queries || []).length ? (
                        analytics.top_queries.map((entry) => (
                          <div key={entry.query} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-stone-700">{entry.query}</span>
                            <span className="font-bold text-stone-900">{entry.count}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-stone-500">No query data yet.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-black/5 bg-white/85 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Most requested missing items</div>
                    <div className="mt-3 space-y-2">
                      {(analytics?.top_missing_items || []).length ? (
                        analytics.top_missing_items.map((entry) => (
                          <div key={entry.ingredient} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-stone-700">{entry.ingredient}</span>
                            <span className="font-bold text-stone-900">{entry.count}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-stone-500">No stock gaps surfaced yet.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-black/5 bg-white/85 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Top recipe intent</div>
                  <div className="mt-3 space-y-2">
                    {(analytics?.top_recipes || []).length ? (
                      analytics.top_recipes.map((entry) => (
                        <div key={entry.dish_name} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-stone-700">{entry.dish_name}</span>
                          <span className="font-bold text-stone-900">{entry.count}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-stone-500">Recipe demand will appear here once customers start asking.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[30px] border border-black/5 bg-[rgba(255,252,247,0.94)] p-5 shadow-[0_20px_55px_rgba(0,0,0,0.06)]">
                <div className="flex items-center gap-2">
                  <Settings2 size={16} className="text-amber-700" />
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Admin tuning</span>
                </div>

                {profileDraft && configDraft ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Store name</span>
                        <input
                          value={profileDraft.store_name || ''}
                          onChange={(event) => setProfileDraft((prev) => ({ ...prev, store_name: event.target.value }))}
                          className="w-full rounded-2xl border border-black/10 bg-white/90 px-3 py-2.5 text-sm text-stone-900 focus:border-teal-600/50 focus:outline-none"
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Phone / WhatsApp</span>
                        <input
                          value={configDraft.whatsapp_number || ''}
                          onChange={(event) => {
                            const value = event.target.value;
                            setConfigDraft((prev) => ({ ...prev, whatsapp_number: value }));
                            setProfileDraft((prev) => ({ ...prev, phone: value }));
                          }}
                          className="w-full rounded-2xl border border-black/10 bg-white/90 px-3 py-2.5 text-sm text-stone-900 focus:border-teal-600/50 focus:outline-none"
                        />
                      </label>
                    </div>

                    <label className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Address</span>
                      <input
                        value={profileDraft.address || ''}
                        onChange={(event) => setProfileDraft((prev) => ({ ...prev, address: event.target.value }))}
                        className="w-full rounded-2xl border border-black/10 bg-white/90 px-3 py-2.5 text-sm text-stone-900 focus:border-teal-600/50 focus:outline-none"
                      />
                    </label>

                    <JsonEditor label="Store hours JSON" value={hoursJson} onChange={setHoursJson} rows={7} />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Default voice language</span>
                        <select
                          value={configDraft.default_voice_language || 'en-IN'}
                          onChange={(event) => setConfigDraft((prev) => ({ ...prev, default_voice_language: event.target.value }))}
                          className="w-full rounded-2xl border border-black/10 bg-white/90 px-3 py-2.5 text-sm text-stone-900 focus:border-teal-600/50 focus:outline-none"
                        >
                          <option value="en-IN">English (India)</option>
                          <option value="hi-IN">Hindi (India)</option>
                        </select>
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">Holiday note</span>
                        <input
                          value={profileDraft.holiday_note || ''}
                          onChange={(event) => setProfileDraft((prev) => ({ ...prev, holiday_note: event.target.value }))}
                          className="w-full rounded-2xl border border-black/10 bg-white/90 px-3 py-2.5 text-sm text-stone-900 focus:border-teal-600/50 focus:outline-none"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-center justify-between rounded-2xl border border-black/10 bg-white/85 px-4 py-3 text-sm text-stone-700">
                        <span className="font-semibold">Enable substitutes</span>
                        <input
                          type="checkbox"
                          checked={Boolean(configDraft.enable_substitutes)}
                          onChange={(event) => setConfigDraft((prev) => ({ ...prev, enable_substitutes: event.target.checked }))}
                          className="h-4 w-4 rounded border-stone-300 text-teal-700 focus:ring-teal-600"
                        />
                      </label>
                      <label className="flex items-center justify-between rounded-2xl border border-black/10 bg-white/85 px-4 py-3 text-sm text-stone-700">
                        <span className="font-semibold">Enable recipe clarifications</span>
                        <input
                          type="checkbox"
                          checked={Boolean(configDraft.enable_recipe_clarifications)}
                          onChange={(event) => setConfigDraft((prev) => ({ ...prev, enable_recipe_clarifications: event.target.checked }))}
                          className="h-4 w-4 rounded border-stone-300 text-teal-700 focus:ring-teal-600"
                        />
                      </label>
                    </div>

                    <JsonEditor label="Recipe bundles JSON" value={recipeBundlesJson} onChange={setRecipeBundlesJson} rows={8} />
                    <JsonEditor label="Substitution rules JSON" value={substitutionRulesJson} onChange={setSubstitutionRulesJson} rows={8} />
                    <JsonEditor label="Clarification rules JSON" value={clarificationRulesJson} onChange={setClarificationRulesJson} rows={8} />

                    <button
                      onClick={saveSettings}
                      disabled={savingSettings}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
                    >
                      <Settings2 size={15} />
                      {savingSettings ? 'Saving...' : 'Save Assistant Settings'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 text-sm text-stone-500">Loading settings...</div>
                )}
              </div>
            </>
          ) : null}
        </aside>
      </div>

      {toast ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-700 shadow-[0_20px_50px_rgba(0,0,0,0.12)]">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
