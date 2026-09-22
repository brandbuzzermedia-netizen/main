'use client';

import { useState } from 'react';
import { products, productCategories } from '@/data/products';
import { ProductCard } from './ProductCard';

const ALL = 'All Products';

export function ProductCatalogue() {
  const [filter, setFilter] = useState<string>(ALL);
  const visible = filter === ALL ? products : products.filter((p) => p.category === filter);

  const tabs = [ALL, ...productCategories];

  return (
    <>
      <h2 className="sr-only">Product categories</h2>
      <div
        role="tablist"
        aria-label="Filter products by category"
        className="-mx-[var(--shell-x)] flex gap-2 overflow-x-auto px-[var(--shell-x)] pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {tabs.map((tab) => {
          const active = tab === filter;
          const count = tab === ALL ? products.length : products.filter((p) => p.category === tab).length;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(tab)}
              className={`shrink-0 whitespace-nowrap border px-4 py-2.5 text-[0.6875rem] uppercase tracking-eyebrow transition-colors duration-300 ${
                active
                  ? 'border-ink bg-ink text-paper'
                  : 'border-mist text-graphite hover:border-ink hover:text-ink'
              }`}
            >
              {tab}
              <span className={`ml-2 ${active ? 'text-mist' : 'text-muted'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <p aria-live="polite" className="sr-only">
        Showing {visible.length} of {products.length} products.
      </p>

      <div className="mt-12 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((product, i) => (
          <ProductCard key={product.slug} product={product} priority={i < 3} index={i + 1} />
        ))}
      </div>
    </>
  );
}
