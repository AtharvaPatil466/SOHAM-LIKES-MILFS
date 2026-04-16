import React, { useState, useEffect } from 'react';
import { Award, Star } from 'lucide-react';
import { authHeaders } from '../api';

const getApiBase = () => (typeof window !== 'undefined' ? window.location.origin : '');

const TIER_META = {
  bronze: { points: '0+ pts', chip: 'bg-[var(--warning-soft)] text-[var(--primary-ink)]' },
  silver: { points: '500+ pts', chip: 'bg-[rgba(215,193,194,0.18)] text-[var(--primary-ink)]' },
  gold: { points: '2000+ pts', chip: 'bg-[var(--accent-soft)] text-[var(--primary-ink)]' },
  platinum: { points: '5000+ pts', chip: 'bg-[rgba(139,211,212,0.22)] text-[var(--primary-ink)]' },
};

export default function LoyaltyTab() {
  const api = getApiBase();
  const [catalog, setCatalog] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${api}/api/loyalty/catalog`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${api}/api/loyalty/catalog/categories`, { headers: authHeaders() }).then((r) => r.json()),
    ])
      .then(([catalogData, categoryData]) => {
        setCatalog(catalogData.products || []);
        setCategories(categoryData.categories || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [api]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[rgba(215,193,194,0.28)] border-t-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="atelier-paper rounded-[28px] p-6">
        <div className="atelier-label text-[10px] text-[var(--ink-muted)]">Loyalty Program</div>
        <h2 className="mt-2 font-display text-3xl font-bold text-[var(--ink)]">Reward tiers and catalog picks</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)]">
          Keep the loyalty experience in the same visual language as the rest of the dashboard while still surfacing reward tiers and featured products clearly.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {Object.entries(TIER_META).map(([tier, meta]) => (
          <div key={tier} className="atelier-paper-soft rounded-[24px] p-5 text-center">
            <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ${meta.chip}`}>
              <Star size={20} />
            </div>
            <div className="font-black capitalize text-[var(--ink)]">{tier}</div>
            <div className="mt-1 text-xs font-semibold text-[var(--ink-muted)]">{meta.points}</div>
          </div>
        ))}
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <span key={category} className="atelier-chip bg-[rgba(215,193,194,0.14)] text-[var(--primary-ink)]">
              {category}
            </span>
          ))}
        </div>
      )}

      <div className="atelier-paper-strong overflow-hidden rounded-[28px]">
        <div className="border-b border-black/5 px-6 py-5">
          <div className="atelier-label text-[10px] text-[var(--ink-muted)]">Catalog</div>
          <h3 className="mt-2 font-display text-2xl font-bold text-[var(--ink)]">Featured loyalty products</h3>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
          {catalog.slice(0, 12).map((product, index) => (
            <div key={index} className="rounded-2xl border border-black/5 bg-white/75 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-[var(--ink)]">{product.product_name || product.name}</div>
                  <div className="mt-1 text-xs text-[var(--ink-muted)]">{product.category || 'Uncategorized'}</div>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Award size={16} />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm font-black text-[var(--primary-ink)]">
                  Rs {(product.unit_price || product.price || 0).toFixed(2)}
                </span>
                <span className={`text-xs font-bold ${product.current_stock > 0 ? 'text-[var(--primary-ink)]' : 'text-[var(--ink-muted)]'}`}>
                  {product.current_stock > 0 ? `${product.current_stock} in stock` : 'Out of stock'}
                </span>
              </div>
            </div>
          ))}
          {catalog.length === 0 && (
            <div className="col-span-full py-10 text-center text-sm text-[var(--ink-muted)]">
              No products in catalog.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
