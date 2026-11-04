'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { products, productCategories, type Product } from '@/data/products';
import { MaterialPlate } from './MaterialPlate';
import { ArrowIcon, WhatsAppIcon } from './Icons';
import { whatsappLink } from '@/lib/whatsapp';

/**
 * The swatch wall: pick a material, see it large, step through the finishes
 * T3 actually publishes for it, and read the specification beside it.
 *
 * Everything shown comes from `products.ts` — the finishes are that product's
 * own gallery entries and the figures are its published specifications. The
 * lit/unlit switch appears only for materials whose gallery contains a lit
 * study, because those are the only ones where the claim means anything.
 */

const isLit = (plate: string) => plate.endsWith('-lit') || plate.endsWith('-backlit');

/** The card plate plus its gallery, with repeats dropped. */
const finishesOf = (p: Product) => {
  const seen = new Set<string>();
  return [{ plate: p.plate, caption: 'Standard finish' }, ...p.gallery].filter((f) =>
    seen.has(f.plate) ? false : (seen.add(f.plate), true),
  );
};

export function MaterialExplorer() {
  const [category, setCategory] = useState<string>('All');
  const shown = useMemo(
    () => (category === 'All' ? products : products.filter((p) => p.category === category)),
    [category],
  );

  const [slug, setSlug] = useState(products[0].slug);
  const active: Product = useMemo(
    () => shown.find((p) => p.slug === slug) ?? shown[0] ?? products[0],
    [shown, slug],
  );

  // Most products repeat their card plate as the first gallery entry. Left
  // in, that renders two swatches with the same React key, and a duplicate
  // key breaks reconciliation: switching material leaves an orphan swatch
  // from the previous one stranded in the strip.
  const finishes = useMemo(() => finishesOf(active), [active]);
  const [finishIndex, setFinishIndex] = useState(0);
  const finish = finishes[Math.min(finishIndex, finishes.length - 1)];
  const litAvailable = finishes.some((f) => isLit(f.plate));

  const pick = (next: Product) => {
    setSlug(next.slug);
    setFinishIndex(0);
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
      {/* ------------------------------------------------------ the sample -- */}
      <div>
        <div className="relative aspect-[5/4] overflow-hidden bg-graphite sm:aspect-[16/10]">
          <MaterialPlate
            key={finish.plate}
            plate={finish.plate}
            alt={`${active.name} — ${finish.caption}`}
            className="h-full w-full animate-page-in object-cover"
          />
          <span className="pointer-events-none absolute inset-0 border border-paper/10" />
          <span className="absolute left-5 top-5 bg-ink/80 px-3 py-1.5 font-mono text-[0.625rem] uppercase tracking-eyebrow text-bronze-light backdrop-blur-sm">
            {active.category}
          </span>
          {litAvailable && isLit(finish.plate) && (
            <span className="absolute right-5 top-5 bg-bronze-light px-3 py-1.5 font-mono text-[0.625rem] uppercase tracking-eyebrow text-ink">
              Backlit
            </span>
          )}
        </div>

        {/* Finishes for this material, from its own gallery. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {finishes.map((f, i) => (
            <button
              key={f.plate}
              type="button"
              onClick={() => setFinishIndex(i)}
              aria-pressed={i === finishIndex}
              className={`group relative h-16 w-16 cursor-pointer overflow-hidden border transition-colors duration-300 ${
                i === finishIndex ? 'border-bronze-light' : 'border-line hover:border-paper/40'
              }`}
            >
              <MaterialPlate plate={f.plate} alt="" className="h-full w-full object-cover" />
              <span className="sr-only">{f.caption}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-stone">
          {finish.caption}
        </p>
      </div>

      {/* ------------------------------------------------- the material list */}
      <div>
        <div className="flex flex-wrap gap-2">
          {['All', ...productCategories].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`cursor-pointer border px-3.5 py-2 font-mono text-[0.625rem] uppercase tracking-eyebrow transition-colors duration-300 ${
                category === c
                  ? 'border-bronze-light bg-bronze-light text-ink'
                  : 'border-line text-stone hover:border-paper/40 hover:text-paper'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <ul className="mt-7 max-h-[19rem] overflow-y-auto border-t border-line">
          {shown.map((p) => (
            <li key={p.slug}>
              <button
                type="button"
                onClick={() => pick(p)}
                aria-current={p.slug === active.slug}
                className={`flex w-full cursor-pointer items-baseline justify-between gap-4 border-b border-line py-3.5 text-left transition-colors duration-300 ${
                  p.slug === active.slug ? 'text-bronze-light' : 'text-mist hover:text-paper'
                }`}
              >
                <span className="font-display text-[1.25rem] tracking-tight">{p.name}</span>
                <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-eyebrow text-stone">
                  {finishesOf(p).length} views
                </span>
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-7 text-[0.9375rem] leading-relaxed text-mist">{active.shortDescription}</p>

        {active.specifications.length > 0 && (
          <dl className="mt-6 border-t border-line font-mono text-[0.75rem]">
            {active.specifications.slice(0, 3).map((spec) => (
              <div key={spec.label} className="flex justify-between gap-6 border-b border-line py-2.5">
                <dt className="uppercase tracking-eyebrow text-stone">{spec.label}</dt>
                <dd className="text-right text-mist">{spec.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/products/${active.slug}/`} className="btn-primary">
            Open {active.name} <ArrowIcon />
          </Link>
          <a
            href={whatsappLink(active.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline"
          >
            <WhatsAppIcon />
            Enquire
          </a>
        </div>
      </div>
    </div>
  );
}
