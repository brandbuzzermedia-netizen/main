import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getProduct, products } from '@/data/products';
import { site } from '@/data/site';
import { MaterialPlate } from '@/components/MaterialPlate';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { WordReveal } from '@/components/WordReveal';
import { Parallax } from '@/components/Parallax';
import { Gallery } from '@/components/Gallery';
import { FAQ } from '@/components/FAQ';
import { CTASection } from '@/components/CTASection';
import { StickyActions } from '@/components/StickyActions';
import { Reveal } from '@/components/Reveal';
import { ProductCard } from '@/components/ProductCard';
import { JsonLd } from '@/components/JsonLd';
import { ArrowIcon, PhoneIcon, WhatsAppIcon } from '@/components/Icons';
import { telLink, whatsappLink } from '@/lib/whatsapp';
import { breadcrumbSchema, faqSchema, productSchema } from '@/lib/seo';

type Params = { params: { slug: string } };

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: Params): Metadata {
  const product = getProduct(params.slug);
  if (!product) return {};
  const url = `${site.url}/products/${product.slug}/`;
  return {
    title: product.seoTitle,
    description: product.seoDescription,
    alternates: { canonical: url },
    openGraph: {
      title: product.seoTitle,
      description: product.seoDescription,
      url,
      siteName: site.name,
      locale: 'en_IN',
      type: 'website',
    },
  };
}

export default function ProductPage({ params }: Params) {
  const product = getProduct(params.slug);
  if (!product) notFound();

  const related = products.filter((p) => p.slug !== product.slug).slice(0, 3);

  const trail = [
    { name: 'Home', href: '/' },
    { name: 'Products', href: '/products/' },
    { name: product.name, href: `/products/${product.slug}/` },
  ];

  return (
    <>
      <JsonLd data={productSchema(product.slug)} />
      <JsonLd data={breadcrumbSchema(trail)} />
      <JsonLd data={faqSchema(product.faq)} />

      {/* ------------------------------------------------------------ hero -- */}
      <section className="relative isolate overflow-hidden bg-charcoal text-paper">
        <Parallax speed={7} className="absolute inset-0 -z-10 h-[116%] w-full">
          <MaterialPlate
            plate={product.plate}
            alt={`${product.name} — ${product.shortDescription}`}
            priority
            className="h-full w-full object-cover"
          />
        </Parallax>
        {/* Horizontal wash so the copy stays legible while the material itself
            is still visible on the right — a full veil hid light materials. */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/92 to-ink/25" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/70 via-transparent to-ink/50" />

        <div className="shell pb-16 pt-10 lg:pb-24 lg:pt-14">
          <div className="[&_a]:text-stone [&_a:hover]:text-paper [&_span]:text-mist">
            <Breadcrumbs trail={trail} />
          </div>

          <p className="eyebrow mt-12 text-bronze-light">{product.category}</p>
          <WordReveal
            as="h1"
            text={product.name}
            immediate
            delay={80}
            className="display-1 mt-6 block max-w-[16ch] text-paper"
          />
          <p className="lede mt-7 max-w-xl text-mist">{product.positioning}</p>

          <div className="mt-11 flex flex-wrap gap-3">
            <a
              href={whatsappLink(product.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp"
            >
              <WhatsAppIcon />
              Enquire on WhatsApp
            </a>
            <Link href="/contact/" className="btn-invert">
              Request a Quote
            </Link>
            <a href={telLink} className="btn-ghost-invert">
              <PhoneIcon />
              Call Now
            </a>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- overview -- */}
      <section className="section" aria-labelledby="overview-heading">
        <div className="shell grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
          <Reveal>
            <p className="eyebrow text-stone">Overview</p>
            <h2 id="overview-heading" className="display-2 mt-5 text-paper">
              What it is, and why it gets specified.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="space-y-6">
              {product.overview.map((para, i) => (
                <p
                  key={i}
                  className={i === 0 ? 'lede text-mist' : 'max-w-prose text-[0.9375rem] leading-relaxed text-mist'}
                >
                  {para}
                </p>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* -------------------------------------------------------- benefits -- */}
      <section className="section-tight border-t border-line" aria-labelledby="benefits-heading">
        <div className="shell">
          <p className="eyebrow text-stone">Key Benefits</p>
          <h2 id="benefits-heading" className="display-2 mt-5 max-w-xl text-paper">
            What you get for specifying it.
          </h2>

          <dl className="mt-12 border-t border-line">
            {product.features.map((f, i) => (
              <Reveal key={f.title} delay={i * 60}>
                <div className="group grid gap-2 border-b border-line py-7 transition-colors duration-500 ease-editorial hover:bg-charcoal sm:grid-cols-[3.5rem_1fr] lg:grid-cols-[5rem_0.85fr_1.15fr] lg:gap-10">
                  <span className="font-display text-lg text-stone transition-colors duration-500 group-hover:text-bronze-light">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <dt className="display-3 text-paper">{f.title}</dt>
                  <dd className="max-w-prose text-[0.9375rem] leading-relaxed text-mist sm:col-span-2 lg:col-span-1">
                    {f.body}
                  </dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------------------------------------------------- applications -- */}
      <section className="section-tight" aria-labelledby="apps-heading">
        <div className="shell grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
          <Reveal>
            <p className="eyebrow text-stone">Applications</p>
            <h2 id="apps-heading" className="display-2 mt-5 text-paper">
              Where it goes.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <ul className="grid gap-x-10 sm:grid-cols-2">
              {product.applications.map((a) => (
                <li
                  key={a}
                  className="border-b border-line py-4 text-[1.0625rem] text-mist"
                >
                  {a}
                </li>
              ))}
            </ul>
            <Link href="/applications/" className="link-line mt-9 inline-flex pb-1">
              See all applications <ArrowIcon />
            </Link>
          </Reveal>
        </div>
      </section>

      <Gallery items={product.gallery} productName={product.name} />

      {/* --------------------------------------------------------- specs ---- */}
      <section className="section-tight" aria-labelledby="specs-heading">
        <div className="shell grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
          <Reveal>
            <p className="eyebrow text-stone">Specifications</p>
            <h2 id="specs-heading" className="display-2 mt-5 text-paper">
              The published detail.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            {product.specifications.length > 0 ? (
              <dl className="border-t border-line">
                {product.specifications.map((s) => (
                  <div
                    key={s.label}
                    className="grid gap-1 border-b border-line py-5 sm:grid-cols-[14rem_1fr] sm:gap-8"
                  >
                    <dt className="text-[0.75rem] uppercase tracking-eyebrow text-stone">
                      {s.label}
                    </dt>
                    <dd className="text-[1.0625rem] text-paper">{s.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {product.specNote && (
              <p className="mt-6 max-w-prose border-l-2 border-bronze bg-charcoal p-5 text-[0.875rem] leading-relaxed text-mist">
                {product.specNote}
              </p>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={whatsappLink(product.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-whatsapp"
              >
                <WhatsAppIcon />
                Ask about sizes &amp; pricing
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <FAQ items={product.faq} title={`${product.name} — questions we get`} />

      {/* ------------------------------------------------------- related ---- */}
      <section className="section-tight bg-charcoal" aria-labelledby="related-heading">
        <div className="shell">
          <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
            <h2 id="related-heading" className="display-2 text-paper">
              Also in the range
            </h2>
            <Link href="/products/" className="link-line pb-1">
              Full catalogue <ArrowIcon />
            </Link>
          </div>
          <div className="mt-12 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        </div>
      </section>

      <CTASection
        title={`Need ${product.name} for your project?`}
        body="Request pricing, availability or product details. Send sizes and quantities and we will come back the same working day."
        productName={product.name}
        plate={product.gallery[2]?.plate ?? product.plate}
      />
      <StickyActions productName={product.name} />
    </>
  );
}
