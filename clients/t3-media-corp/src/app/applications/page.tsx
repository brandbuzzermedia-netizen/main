import Link from 'next/link';
import { applications } from '@/data/applications';
import { audiences } from '@/data/site';
import { ApplicationCard } from '@/components/ApplicationCard';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { CTASection } from '@/components/CTASection';
import { Reveal } from '@/components/Reveal';
import { StickyActions } from '@/components/StickyActions';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbSchema, pageMetadata } from '@/lib/seo';
import { ArrowIcon } from '@/components/Icons';

export const metadata = pageMetadata({
  title: 'Material Applications in Bengaluru | T3 Media Corp',
  description:
    'Where T3 Media Corp materials go — kitchens, wardrobes, ceilings, wall panels, partitions, furniture, hospitality, retail and architectural features.',
  path: '/applications/',
});

const trail = [
  { name: 'Home', href: '/' },
  { name: 'Applications', href: '/applications/' },
];

export default function ApplicationsPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema(trail)} />

      <section className="border-b border-mist pb-14 pt-10 lg:pb-20 lg:pt-14">
        <div className="shell">
          <Breadcrumbs trail={trail} />
          <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
            <h1 className="display-1 text-ink">Where these materials go.</h1>
            <p className="lede self-end">
              Most enquiries do not start with a material — they start with a room, an elevation or
              a piece of furniture. This is the range read the other way round: by application, with
              the materials that suit each one.
            </p>
          </div>

          <ul className="mt-12 flex flex-wrap gap-2">
            {audiences.map((a) => (
              <li
                key={a}
                className="border border-mist px-3.5 py-2 text-[0.6875rem] uppercase tracking-eyebrow text-graphite"
              >
                {a}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <h2 className="sr-only">Applications by space</h2>
          <div className="grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
            {applications.map((a, i) => (
              <Reveal key={a.slug} delay={(i % 3) * 80}>
                <ApplicationCard application={a} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section-tight bg-bone">
        <div className="shell flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow text-muted">Start from the material instead</p>
            <h2 className="display-2 mt-5 max-w-xl text-ink">
              Browse the full catalogue by category.
            </h2>
          </div>
          <Link href="/products/" className="btn-primary">
            View Products
          </Link>
        </div>
      </section>

      <CTASection
        title="Got a room, a drawing or a reference photo?"
        body="Send it over. We will tell you which materials will do the job, what they cost and what is on the shelf right now."
      />
      <StickyActions />
    </>
  );
}
