import type { Metadata } from 'next';
import { site } from '@/data/site';
import { products } from '@/data/products';

export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = `${site.url}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: site.name,
      locale: 'en_IN',
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

/** LocalBusiness — carried on every page via the root layout. */
export function localBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'HomeGoodsStore',
    '@id': `${site.url}/#business`,
    name: site.name,
    slogan: site.tagline,
    description: site.description,
    url: site.url,
    telephone: site.phone,
    email: site.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address.street,
      addressLocality: site.address.locality,
      addressRegion: site.address.region,
      postalCode: site.address.postalCode,
      addressCountry: site.address.country,
    },
    areaServed: { '@type': 'City', name: 'Bengaluru' },
    openingHours: site.hours.schema,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Interior and architectural materials',
      itemListElement: products.map((p) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Product', name: p.name, url: `${site.url}/products/${p.slug}/` },
      })),
    },
  };
}

export function productSchema(slug: string) {
  const p = products.find((x) => x.slug === slug);
  if (!p) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.shortDescription,
    url: `${site.url}/products/${p.slug}/`,
    category: p.category,
    brand: { '@type': 'Brand', name: site.name },
    // No price or review data is published by T3, so none is asserted here.
    offers: {
      '@type': 'Offer',
      availability: 'https://schema.org/InStock',
      priceCurrency: 'INR',
      url: `${site.url}/products/${p.slug}/`,
      seller: { '@type': 'Organization', name: site.name },
    },
  };
}

export function faqSchema(faq: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function breadcrumbSchema(trail: { name: string; href: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: `${site.url}${t.href}`,
    })),
  };
}
