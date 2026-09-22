import Link from 'next/link';
import type { Product } from '@/data/products';
import { MaterialPlate } from './MaterialPlate';
import { Reveal } from './Reveal';
import { ArrowIcon } from './Icons';

export function ProductCard({
  product,
  priority = false,
  index,
  size = 'default',
}: {
  product: Product;
  priority?: boolean;
  /** Shown as an editorial index in the image corner when provided. */
  index?: number;
  size?: 'default' | 'wide';
}) {
  return (
    <Link
      href={`/products/${product.slug}/`}
      className="group flex cursor-pointer flex-col focus-visible:outline-offset-8"
    >
      <div
        className={`relative overflow-hidden bg-bone ${
          size === 'wide' ? 'aspect-[16/10]' : 'aspect-[4/5]'
        }`}
      >
        <Reveal variant="plate" className="h-full w-full">
          <MaterialPlate
            plate={product.plate}
            alt={`${product.name} — material study, ${product.shortDescription.toLowerCase()}`}
            priority={priority}
            className="zoom-plate h-full w-full object-cover"
          />
        </Reveal>

        {/* Inner hairline keeps the sample reading as a framed swatch. */}
        <span className="pointer-events-none absolute inset-0 border border-ink/10" />
        {/* Weight the lower edge so the caption below has something to sit against. */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink/25 to-transparent opacity-70 transition-opacity duration-700 ease-editorial group-hover:opacity-100" />

        <span className="absolute left-4 top-4 bg-paper/92 px-3 py-1.5 font-mono text-[0.625rem] font-medium uppercase tracking-eyebrow text-bronze backdrop-blur-sm">
          {product.category}
        </span>

        <span className="absolute bottom-4 right-4 flex h-10 w-10 translate-y-2 items-center justify-center bg-paper text-ink opacity-0 transition-all duration-500 ease-editorial group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowIcon className="h-4 w-4" />
        </span>
      </div>

      <div className="flex flex-1 flex-col pt-6">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="display-3 relative inline-block text-ink">
            {product.name}
            <span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-bronze transition-transform duration-500 ease-editorial group-hover:scale-x-100" />
          </h3>
          {index !== undefined && (
            <span className="shrink-0 font-mono text-[0.75rem] leading-none text-muted">
              {String(index).padStart(2, '0')}
            </span>
          )}
        </div>
        <p className="mt-3.5 max-w-sm text-[0.9375rem] leading-relaxed text-slate">
          {product.shortDescription}
        </p>
      </div>
    </Link>
  );
}
