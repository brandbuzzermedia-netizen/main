import type { Product } from '@/data/products';
import { ProductCard } from './ProductCard';
import { Reveal } from './Reveal';

export function ProductGrid({
  items,
  columns = 3,
}: {
  items: Product[];
  columns?: 2 | 3;
}) {
  return (
    <div
      className={`grid gap-x-8 gap-y-14 sm:grid-cols-2 ${
        columns === 3 ? 'lg:grid-cols-3' : ''
      }`}
    >
      {items.map((product, i) => (
        <Reveal key={product.slug} delay={(i % 3) * 90}>
          <ProductCard product={product} priority={i < 3} />
        </Reveal>
      ))}
    </div>
  );
}
