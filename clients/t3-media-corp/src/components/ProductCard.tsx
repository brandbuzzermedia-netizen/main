import Link from 'next/link';
import type { Product } from '@/data/products';
import { MaterialPlate } from './MaterialPlate';
import { ArrowIcon } from './Icons';

export function ProductCard({
  product,
  priority = false,
  size = 'default',
}: {
  product: Product;
  priority?: boolean;
  size?: 'default' | 'wide';
}) {
  return (
    <Link
      href={`/products/${product.slug}/`}
      className="group flex flex-col focus-visible:outline-offset-8"
    >
      <div
        className={`relative overflow-hidden bg-bone ${
          size === 'wide' ? 'aspect-[16/10]' : 'aspect-[4/5]'
        }`}
      >
        <MaterialPlate
          plate={product.plate}
          alt={`${product.name} — material study, ${product.shortDescription.toLowerCase()}`}
          priority={priority}
          className="zoom-plate h-full w-full object-cover"
        />
        <span className="pointer-events-none absolute inset-0 bg-ink/0 transition-colors duration-700 ease-editorial group-hover:bg-ink/10" />
        <span className="absolute left-5 top-5 bg-paper/90 px-3 py-1.5 text-[0.625rem] font-medium uppercase tracking-eyebrow text-graphite backdrop-blur-sm">
          {product.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col pt-6">
        <h3 className="display-3 text-ink">{product.name}</h3>
        <p className="mt-3 max-w-sm text-[0.9375rem] leading-relaxed text-slate">
          {product.shortDescription}
        </p>
        <span className="link-line mt-6 self-start pb-1">
          Explore <ArrowIcon />
        </span>
      </div>
    </Link>
  );
}
