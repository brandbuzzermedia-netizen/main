import Link from 'next/link';
import { audiences, site, strengths } from '@/data/site';
import { products } from '@/data/products';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { WordReveal } from '@/components/WordReveal';
import { Parallax } from '@/components/Parallax';
import { CTASection } from '@/components/CTASection';
import { MaterialPlate } from '@/components/MaterialPlate';
import { Reveal } from '@/components/Reveal';
import { StickyActions } from '@/components/StickyActions';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbSchema, pageMetadata } from '@/lib/seo';
import { ArrowIcon } from '@/components/Icons';

export const metadata = pageMetadata({
  title: 'About T3 Media Corp | Interior Materials Bengaluru',
  description:
    'T3 Media Corp supplies interior and architectural materials from Begur Road, Bommanahalli — for designers, architects, manufacturers and contractors.',
  path: '/about/',
});

const trail = [
  { name: 'Home', href: '/' },
  { name: 'About', href: '/about/' },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema(trail)} />

      <section className="border-b border-mist pb-14 pt-10 lg:pb-20 lg:pt-14">
        <div className="shell">
          <Breadcrumbs trail={trail} />
          <p className="eyebrow mt-10 text-muted">{site.tagline}</p>
          <WordReveal
            as="h1"
            text="A material supplier that answers the hard questions."
            immediate
            delay={80}
            className="display-1 mt-6 block max-w-[18ch] text-ink"
          />
          <p className="lede mt-8 max-w-2xl">
            T3 Media Corp supplies interior and architectural materials from Begur Road in
            Bommanahalli, Bengaluru. Surfaces, panels, doors, glass and acrylic — plus the CNC
            cutting that turns them into finished components.
          </p>
        </div>
      </section>

      <section className="relative isolate overflow-hidden">
        <div className="aspect-[21/9] w-full overflow-hidden">
          <Parallax speed={8} className="h-[115%] w-full">
            <MaterialPlate
              plate="showroom"
              alt="Material samples on display at the T3 Media Corp showroom in Bommanahalli"
              priority
              className="h-full w-full object-cover"
            />
          </Parallax>
        </div>
      </section>

      <section className="section" aria-labelledby="who-heading">
        <div className="shell grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <Reveal>
            <p className="eyebrow text-muted">Who we are</p>
            <h2 id="who-heading" className="display-2 mt-5 text-ink">
              One counter, eleven categories.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="space-y-6">
              <p className="lede text-graphite">
                Sourcing interior materials in Bengaluru usually means four suppliers, four lead
                times and four people to chase when something does not arrive. T3 Media Corp exists
                to collapse that into one conversation.
              </p>
              <p className="max-w-prose text-[0.9375rem] leading-relaxed text-slate">
                The range spans acrylic laminates and alabaster sheets, WPC doors and vascal frames,
                acrylic and mirror sheets, digital glass, wallpapers, PVC ply and ACP — exterior and
                interior grade. CNC cutting sits alongside all of it, so a sheet can leave as a
                finished panel rather than a job for someone else.
              </p>
              <p className="max-w-prose text-[0.9375rem] leading-relaxed text-slate">
                What holds it together is a bias towards straight answers. If a material is wrong
                for your application, we would rather say so at the counter than sell it and deal
                with it at handover.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section-tight border-t border-mist" aria-labelledby="offer-heading">
        <div className="shell">
          <p className="eyebrow text-muted">What we offer</p>
          <h2 id="offer-heading" className="display-2 mt-5 max-w-xl text-ink">
            The full material schedule, in stock.
          </h2>
          <ul className="mt-12 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/products/${p.slug}/`}
                  className="group flex items-baseline justify-between gap-4 border-b border-mist py-5 transition-colors duration-300 hover:border-ink"
                >
                  <span className="font-display text-[1.375rem] tracking-tight text-ink">
                    {p.name}
                  </span>
                  <ArrowIcon className="h-3.5 w-3.5 shrink-0 text-muted transition-all duration-500 ease-editorial group-hover:translate-x-1 group-hover:text-ink" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section bg-ink text-paper" aria-labelledby="serve-heading">
        <div className="shell grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <Reveal>
            <p className="eyebrow text-bronze-light">Who we serve</p>
            <h2 id="serve-heading" className="display-2 mt-5 text-paper">
              Mostly professionals. Often on a deadline.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="lede text-mist">
              Interior designers and architects specifying a scheme. Furniture manufacturers who
              need finish consistency across a batch. Contractors and builders pricing a BOQ.
              Commercial developers, modular furniture companies, retail and hospitality fit-out
              teams — and homeowners who want the same materials the professionals use.
            </p>
            <ul className="mt-10 grid gap-x-8 sm:grid-cols-2">
              {audiences.map((a) => (
                <li
                  key={a}
                  className="border-b border-white/15 py-4 text-[1.0625rem] text-mist"
                >
                  {a}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="section" aria-labelledby="why-heading">
        <div className="shell">
          <p className="eyebrow text-muted">Why professionals work with us</p>
          <h2 id="why-heading" className="display-2 mt-5 max-w-xl text-ink">
            Six things that keep the specifications coming back.
          </h2>

          <dl className="mt-12 border-t border-mist">
            {strengths.map((s, i) => (
              <Reveal key={s.title} delay={i * 60}>
                <div className="group grid gap-2 border-b border-mist py-8 transition-colors duration-500 ease-editorial hover:bg-bone sm:grid-cols-[3.5rem_1fr] lg:grid-cols-[5rem_0.85fr_1.15fr] lg:gap-10">
                  <span className="font-display text-lg text-muted transition-colors duration-500 group-hover:text-bronze">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <dt className="display-3 text-ink">{s.title}</dt>
                  <dd className="max-w-prose text-[0.9375rem] leading-relaxed text-slate sm:col-span-2 lg:col-span-1">
                    {s.body}
                  </dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      <section className="section-tight bg-bone" aria-labelledby="where-heading">
        <div className="shell grid gap-10 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <p className="eyebrow text-muted">Where to find us</p>
            <h2 id="where-heading" className="display-2 mt-5 text-ink">
              Begur Road, Bommanahalli.
            </h2>
            <p className="lede mt-6">
              {site.address.full}
              <br />
              <span className="text-graphite">
                {site.hours.days}, {site.hours.time}
              </span>
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href={site.mapsDirections}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                Get Directions
              </a>
              <Link href="/contact/" className="btn-outline">
                Contact Us
              </Link>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="aspect-[4/3] w-full border border-mist bg-paper">
              <iframe
                src={site.mapsEmbed}
                title="T3 Media Corp location — Begur Road, Bommanahalli, Bengaluru"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-full w-full grayscale transition-[filter] duration-700 hover:grayscale-0"
              />
            </div>
          </Reveal>
        </div>
      </section>

      <CTASection />
      <StickyActions />
    </>
  );
}
