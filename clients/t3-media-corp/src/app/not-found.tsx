import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="section">
      <div className="shell max-w-2xl">
        <p className="eyebrow text-stone">404</p>
        <h1 className="display-1 mt-6 text-ink">This page has moved on.</h1>
        <p className="lede mt-6">
          The material you were after is probably still here — the catalogue has every category.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/products/" className="btn-primary">
            Browse Products
          </Link>
          <Link href="/contact/" className="btn-outline">
            Contact Us
          </Link>
        </div>
      </div>
    </section>
  );
}
