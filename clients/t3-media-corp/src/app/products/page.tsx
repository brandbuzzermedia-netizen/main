import { Breadcrumbs } from '@/components/Breadcrumbs';
import { WordReveal } from '@/components/WordReveal';
import { CTASection } from '@/components/CTASection';
import { ProductCatalogue } from '@/components/ProductCatalogue';
import { StickyActions } from '@/components/StickyActions';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbSchema, pageMetadata } from '@/lib/seo';
import { products } from '@/data/products';
import { site } from '@/data/site';

export const metadata = pageMetadata({
  title: 'Interior Material Catalogue in Bangalore | T3 Media Corp',
  description:
    'The full T3 Media Corp catalogue — acrylic laminates, alabaster sheets, WPC doors, mirror and acrylic sheets, digital glass, PVC ply, ACP and CNC cutting.',
  path: '/products/',
});

const trail = [
  { name: 'Home', href: '/' },
  { name: 'Products', href: '/products/' },
];

export default function ProductsPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema(trail)} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Interior and architectural materials',
          itemListElement: products.map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: p.name,
            url: `${site.url}/products/${p.slug}/`,
          })),
        }}
      />

      <section className="border-b border-line pb-14 pt-10 lg:pb-20 lg:pt-14">
        <div className="shell">
          <Breadcrumbs trail={trail} />
          <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
            <WordReveal
              as="h1"
              text="The catalogue."
              immediate
              className="display-1 block text-paper"
            />
            <p className="lede self-end">
              Eleven categories covering surfaces, panels, doors, glass and acrylic — plus CNC
              cutting to turn any of them into finished components. Filter by category, or send us
              the material schedule and we will price the whole thing.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <ProductCatalogue />
        </div>
      </section>

      <CTASection
        title="Need the whole material schedule priced?"
        body="Send the drawing set or the BOQ line items. We will come back with what is in stock, what needs ordering and what it costs."
      />
      <StickyActions />
    </>
  );
}
