import Link from 'next/link';
import { products, featuredProducts } from '@/data/products';
import { applications } from '@/data/applications';
import { audiences, site, strengths } from '@/data/site';
import { MaterialPlate } from '@/components/MaterialPlate';
import { ProductCard } from '@/components/ProductCard';
import { Reveal } from '@/components/Reveal';
import { WordReveal } from '@/components/WordReveal';
import { Parallax } from '@/components/Parallax';
import { HorizontalRail } from '@/components/HorizontalRail';
import { MaterialExplorer } from '@/components/MaterialExplorer';
import { CTASection } from '@/components/CTASection';
import { StickyActions } from '@/components/StickyActions';
import { ArrowIcon, PhoneIcon, PinIcon, WhatsAppIcon } from '@/components/Icons';
import { telLink, whatsappLink } from '@/lib/whatsapp';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Interior & Architectural Materials Bangalore | T3 Media Corp',
  description:
    'Interior and architectural materials in Bengaluru — acrylic laminates, alabaster sheets, WPC doors, digital glass, PVC ply, ACP and CNC cutting.',
  path: '/',
});

export default function HomePage() {
  return (
    <>
      {/* ------------------------------------------------------------ hero -- */}
      <section className="relative isolate flex min-h-[calc(100svh-72px)] items-end overflow-hidden bg-charcoal text-paper lg:min-h-[calc(100svh-88px)]">
        <Parallax speed={9} className="absolute inset-0 -z-10 h-[118%] w-full">
          <MaterialPlate
            plate="hero"
            alt="Layered interior and architectural materials"
            priority
            className="h-full w-full object-cover"
          />
        </Parallax>
        {/* A scrim on the reading side only. A full veil over the plate put
            the room's light out, which is the one thing the hero is for. */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/75 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-2/5 bg-gradient-to-t from-ink to-transparent" />

        <div className="shell w-full pb-16 pt-28 lg:pb-24 lg:pt-36">
          <p className="eyebrow animate-rise text-bronze-light">{site.tagline}</p>

          <WordReveal
            as="h1"
            text="Materials that make living better."
            immediate
            delay={120}
            step={70}
            className="display-1 mt-7 block max-w-[15ch] text-paper"
          />

          <p className="lede mt-8 max-w-xl animate-rise text-mist [animation-delay:180ms]">
            Premium interior and architectural materials for designers, architects, furniture
            manufacturers, contractors and modern spaces — sourced from one counter in Bommanahalli.
          </p>

          <div className="mt-11 flex animate-rise flex-wrap gap-3 [animation-delay:260ms]">
            <Link href="/products/" className="btn-invert">
              Explore Products
            </Link>
            <Link href="/contact/" className="btn-ghost-invert">
              Get a Quote
            </Link>
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp"
            >
              <WhatsAppIcon />
              WhatsApp
            </a>
          </div>

          <dl className="mt-16 grid max-w-3xl animate-rise grid-cols-2 border-t border-bronze-light/30 sm:grid-cols-4 [animation-delay:340ms]">
            {[
              ['11', 'Material categories'],
              ['100+', 'Alabaster designs'],
              ['100+', 'Digital glass designs'],
              ['Mon–Sat', 'Showroom open'],
            ].map(([value, label], i) => (
              <div
                key={label}
                className={`py-8 ${i > 0 ? 'sm:border-l sm:border-white/10 sm:pl-8' : ''} ${
                  i % 2 === 1 ? 'border-l border-white/10 pl-8 sm:pl-8' : ''
                }`}
              >
                <dt className="sr-only">{label}</dt>
                <dd>
                  <span className="block whitespace-nowrap font-display text-4xl text-paper lg:text-[2.75rem]">
                    {value}
                  </span>
                  <span className="mt-2 block font-mono text-[0.6875rem] uppercase tracking-eyebrow text-stone">
                    {label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* --------------------------------------------------- what T3 does -- */}
      <section className="section-tight border-b border-line" aria-labelledby="intro-heading">
        <div className="shell grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <Reveal>
            <p className="eyebrow text-stone">T3 Media Corp · Bengaluru</p>
            <h2 id="intro-heading" className="display-2 mt-5 text-paper">
              One supplier for the whole material schedule.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="lede">
              Surfaces, panels, doors, glass and acrylic sit in the same building on Begur Road —
              so a specification can be closed in one visit instead of chased across four vendors.
              We supply the professionals who build Bengaluru&rsquo;s interiors, and the homeowners
              who live in them.
            </p>
            <ul className="mt-8 flex flex-wrap gap-x-2.5 gap-y-2.5">
              {audiences.map((a) => (
                <li
                  key={a}
                  className="border border-line px-3.5 py-2 text-[0.6875rem] uppercase tracking-eyebrow text-mist"
                >
                  {a}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------- range marquee --- */}
      <div className="marquee-mask overflow-hidden border-y border-line bg-charcoal py-4">
        <div className="marquee-track" aria-hidden="true">
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0 items-center">
              {products.map((p) => (
                <li
                  key={`${copy}-${p.slug}`}
                  className="flex items-center whitespace-nowrap font-mono text-[0.6875rem] uppercase tracking-eyebrow text-stone"
                >
                  <span className="px-6">{p.name}</span>
                  <span className="h-1 w-1 rounded-full bg-clay" />
                </li>
              ))}
            </ul>
          ))}
        </div>
        <span className="sr-only">
          Product range: {products.map((p) => p.name).join(', ')}.
        </span>
      </div>

      {/* ------------------------------------------------ product categories */}
      <section aria-labelledby="products-heading">
        <div className="shell pt-[clamp(4.5rem,9vw,9rem)]">
          <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
            <div>
              <p className="eyebrow text-bronze-light">The Range</p>
              <h2 id="products-heading" className="display-2 mt-5 max-w-xl text-paper">
                Eleven categories, one counter.
              </h2>
            </div>
            <Link href="/products/" className="link-line pb-1">
              Full catalogue <ArrowIcon />
            </Link>
          </div>
        </div>

        {/* The range is read sideways: the page holds still while the
            catalogue passes through it. Touch devices get a swipe strip. */}
        <HorizontalRail className="mt-2">
          {products.map((product, i) => (
            <article
              key={product.slug}
              data-cursor="View"
              className="w-[78vw] shrink-0 snap-center sm:w-[56vw] lg:w-[30vw] xl:w-[26vw]"
            >
              <ProductCard product={product} index={i + 1} priority={i < 3} />
            </article>
          ))}
          <div className="flex w-[78vw] shrink-0 snap-center flex-col justify-center sm:w-[42vw] lg:w-[24vw]">
            <p className="display-3 text-paper">Not sure which one?</p>
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-mist">
              Send the drawing or the area schedule. We will tell you what fits, what is in
              stock, and what it costs.
            </p>
            <Link href="/contact/" className="btn-primary mt-7 self-start">
              Get a Quote
            </Link>
          </div>
        </HorizontalRail>
      </section>

      {/* ------------------------------------------------ material explorer  */}
      <section className="section border-t border-line bg-charcoal" aria-labelledby="explorer-heading">
        <div className="shell">
          <div className="max-w-2xl">
            <p className="eyebrow text-bronze-light">The Swatch Wall</p>
            <h2 id="explorer-heading" className="display-2 mt-5 text-paper">
              Pick a material. See what it does.
            </h2>
            <p className="lede mt-6">
              Every finish here is one we stock, shown at the size you would judge it at. Step
              through them, then take the ones that work to the enquiry.
            </p>
          </div>
          <div className="mt-14">
            <MaterialExplorer />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ featured materials */}
      <section className="light-break" aria-labelledby="featured-heading">
        <div className="shell section">
          <p className="eyebrow text-stone">Featured Materials</p>
          <h2 id="featured-heading" className="display-2 mt-5 max-w-2xl text-paper">
            Three materials that decide how a space is remembered.
          </h2>

          <div className="mt-16 space-y-20 lg:space-y-28">
            {featuredProducts.map((product, i) => (
              <Reveal key={product.slug}>
                <article
                  className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${
                    i % 2 === 1 ? 'lg:[&>figure]:order-2' : ''
                  }`}
                >
                  <figure className="group aspect-[4/3] overflow-hidden bg-graphite">
                    <Reveal variant="plate" className="h-full w-full">
                      <MaterialPlate
                        plate={product.gallery[1]?.plate ?? product.plate}
                        alt={`${product.name} — ${product.gallery[1]?.caption ?? 'material study'}`}
                        className="zoom-plate h-full w-full object-cover"
                      />
                    </Reveal>
                  </figure>

                  <div>
                    <p className="eyebrow text-stone">
                      {String(i + 1).padStart(2, '0')} · {product.category}
                    </p>
                    <h3 className="display-2 mt-5 text-paper">{product.name}</h3>
                    <p className="lede mt-5">{product.positioning}</p>
                    <p className="mt-5 max-w-prose text-[0.9375rem] leading-relaxed text-mist">
                      {product.overview[0]}
                    </p>

                    <ul className="mt-8 grid gap-x-8 gap-y-3 border-t border-line pt-6 sm:grid-cols-2">
                      {product.applications.slice(0, 6).map((a) => (
                        <li key={a} className="text-[0.875rem] text-mist">
                          {a}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-9 flex flex-wrap gap-3">
                      <Link href={`/products/${product.slug}/`} className="btn-primary">
                        View {product.name}
                      </Link>
                      <a
                        href={whatsappLink(product.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-outline"
                      >
                        <WhatsAppIcon />
                        Enquire
                      </a>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- why T3 ----- */}
      <section className="section bg-charcoal text-paper" aria-labelledby="why-heading">
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <Reveal>
              <p className="eyebrow text-bronze-light">Why T3 Media Corp</p>
              <h2 id="why-heading" className="display-2 mt-5 text-paper">
                Six reasons specifications come back to us.
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="lede text-mist">
                A material supplier is judged twice: once at the quotation, and again two years
                later when the surface is still holding up. These are the things designers and
                contractors tell us made the difference.
              </p>
            </Reveal>
          </div>

          <ol className="mt-16 border-t border-white/15">
            {strengths.map((s, i) => (
              <Reveal key={s.title} as="li" delay={i * 60}>
                <div className="group grid gap-3 border-b border-white/15 py-8 transition-colors duration-500 ease-editorial hover:bg-graphite/[0.04] sm:grid-cols-[4rem_1fr] lg:grid-cols-[6rem_0.9fr_1.1fr] lg:gap-10 lg:py-10">
                  <span className="font-mono text-[0.8125rem] text-stone transition-colors duration-500 group-hover:text-bronze-light">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="display-3 text-paper">{s.title}</h3>
                  <p className="max-w-prose text-[0.9375rem] leading-relaxed text-mist sm:col-span-2 lg:col-span-1">
                    {s.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------- applications ----- */}
      <section className="section overflow-hidden" aria-labelledby="applications-heading">
        <div className="shell">
          <p className="display-poster select-none text-paper/[0.07]" aria-hidden="true">
            Applied
          </p>
          <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
            <div>
              <p className="eyebrow text-stone">Where It Goes</p>
              <h2 id="applications-heading" className="display-2 mt-5 max-w-xl text-paper">
                From a pooja room ceiling to a weather-facing facade.
              </h2>
            </div>
            <Link href="/applications/" className="link-line pb-1">
              All applications <ArrowIcon />
            </Link>
          </div>

          <ul className="mt-12 grid gap-x-8 gap-y-0 sm:grid-cols-2 lg:grid-cols-3">
            {applications.map((a, i) => (
              <Reveal key={a.slug} as="li" delay={(i % 3) * 70}>
                <Link
                  href={`/applications/#${a.slug}`}
                  className="group flex items-baseline justify-between gap-4 border-b border-line py-5 transition-colors duration-300 hover:border-paper"
                >
                  <span className="font-display text-[1.375rem] tracking-tight text-paper">
                    {a.name}
                  </span>
                  <ArrowIcon className="h-3.5 w-3.5 shrink-0 translate-x-0 text-stone transition-all duration-500 ease-editorial group-hover:translate-x-1 group-hover:text-paper" />
                </Link>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------ material experience ----- */}
      <section className="relative isolate overflow-hidden bg-ink text-paper">
        <MaterialPlate
          plate="showroom"
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-charcoal via-charcoal/90 to-charcoal/60" />
        <div className="shell section">
          <Reveal>
            <p className="eyebrow text-bronze-light">The Material Experience</p>
            <blockquote className="display-2 mt-7 max-w-4xl text-paper">
              A material has to do five things at once: look right, work hard, last, bend to the
              design, and go up without a fight on site.
            </blockquote>
            <p className="lede mt-8 max-w-2xl text-mist">
              Most catalogues make you trade one for another. Our job is to find the material that
              does not — and to say so plainly when no such material exists for your brief.
            </p>

            <ul className="mt-14 grid gap-x-10 gap-y-8 border-t border-white/15 pt-10 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ['Aesthetics', 'The finish that matches the intent of the drawing.'],
                ['Functionality', 'Right material for the room it actually sits in.'],
                ['Durability', 'Judged at year three, not on handover day.'],
                ['Design flexibility', 'Cut, shaped and sized to the detail.'],
                ['Practical installation', 'Fixed with the tools your team already owns.'],
              ].map(([title, body]) => (
                <li key={title}>
                  <h3 className="font-display text-xl text-paper">{title}</h3>
                  <p className="mt-2.5 text-[0.875rem] leading-relaxed text-stone">{body}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------- local presence ----- */}
      <section className="section" aria-labelledby="location-heading">
        <div className="shell grid gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <p className="eyebrow text-stone">Bengaluru</p>
            <h2 id="location-heading" className="display-2 mt-5 text-paper">
              On Begur Road, in Bommanahalli.
            </h2>
            <p className="lede mt-6">
              Translucent and high-gloss materials cannot be judged on a screen. Come and see the
              alabaster lit, and the gloss under a real downlight — it takes twenty minutes and
              settles most specification arguments.
            </p>

            <dl className="mt-10 space-y-5 border-t border-line pt-8">
              <div className="flex gap-4">
                <dt className="sr-only">Address</dt>
                <PinIcon className="mt-1 h-4 w-4 shrink-0 text-bronze-light" />
                <dd className="text-[0.9375rem] leading-relaxed text-mist">
                  Begur Road, Bommanahalli
                  <br />
                  Bangalore – 560068, Karnataka
                </dd>
              </div>
              <div className="flex gap-4">
                <dt className="sr-only">Phone</dt>
                <PhoneIcon className="mt-1 h-4 w-4 shrink-0 text-bronze-light" />
                <dd>
                  <a href={telLink} className="text-[0.9375rem] text-mist hover:text-bronze-light">
                    {site.phoneDisplay}
                  </a>
                </dd>
              </div>
            </dl>

            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href={site.mapsDirections}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                Visit Our Location
              </a>
              <Link href="/contact/" className="btn-outline">
                Contact Details
              </Link>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="aspect-[4/3] w-full border border-line bg-charcoal lg:aspect-auto lg:h-full lg:min-h-[420px]">
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
