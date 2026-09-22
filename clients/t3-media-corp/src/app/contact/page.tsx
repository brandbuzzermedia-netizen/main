import { site } from '@/data/site';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { WordReveal } from '@/components/WordReveal';
import { ContactForm } from '@/components/ContactForm';
import { StickyActions } from '@/components/StickyActions';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbSchema, pageMetadata } from '@/lib/seo';
import { ClockIcon, MailIcon, PhoneIcon, PinIcon, WhatsAppIcon } from '@/components/Icons';
import { mailLink, telLink, whatsappLink } from '@/lib/whatsapp';

export const metadata = pageMetadata({
  title: 'Contact T3 Media Corp | Bommanahalli, Bengaluru',
  description:
    'Request a quote for interior materials in Bangalore. Call +91 63637 86330, message on WhatsApp, or visit us on Begur Road, Bommanahalli, Mon to Sat.',
  path: '/contact/',
});

const trail = [
  { name: 'Home', href: '/' },
  { name: 'Contact', href: '/contact/' },
];

export default function ContactPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema(trail)} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ContactPage',
          name: `Contact ${site.name}`,
          url: `${site.url}/contact/`,
          mainEntity: { '@id': `${site.url}/#business` },
        }}
      />

      <section className="border-b border-line pb-14 pt-10 lg:pb-20 lg:pt-14">
        <div className="shell">
          <Breadcrumbs trail={trail} />
          <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
            <WordReveal
              as="h1"
              text="Let’s talk materials."
              immediate
              className="display-1 block text-paper"
            />
            <p className="lede self-end">
              Tell us the room, the quantity or the drawing. You will get an answer on
              suitability, availability and price — not a brochure.
            </p>
          </div>

          <div className="mt-12 flex flex-wrap gap-3">
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp"
            >
              <WhatsAppIcon />
              WhatsApp Us
            </a>
            <a href={telLink} className="btn-primary">
              <PhoneIcon />
              Call Now
            </a>
            <a
              href={site.mapsDirections}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline"
            >
              <PinIcon />
              Get Directions
            </a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell grid gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
          <div>
            <p className="eyebrow text-stone">Request a Quote</p>
            <h2 className="display-2 mt-5 text-paper">Send us the requirement.</h2>
            <div className="mt-10">
              <ContactForm />
            </div>
          </div>

          <aside className="lg:pt-16">
            <div className="border border-line bg-charcoal p-8 lg:p-10">
              <p className="eyebrow text-stone">T3 Media Corp</p>
              <address className="mt-7 space-y-6 not-italic">
                <div className="flex gap-4">
                  <PinIcon className="mt-1 h-4 w-4 shrink-0 text-bronze-light" />
                  <div>
                    <p className="text-[0.75rem] uppercase tracking-eyebrow text-stone">Showroom</p>
                    <p className="mt-1.5 text-[1.0625rem] leading-relaxed text-paper">
                      Begur Road, Bommanahalli
                      <br />
                      Bangalore – 560068
                      <br />
                      Karnataka, India
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <PhoneIcon className="mt-1 h-4 w-4 shrink-0 text-bronze-light" />
                  <div>
                    <p className="text-[0.75rem] uppercase tracking-eyebrow text-stone">Phone</p>
                    <a
                      href={telLink}
                      className="mt-1.5 inline-flex min-h-[40px] items-center text-[1.0625rem] text-paper transition-colors hover:text-bronze-light"
                    >
                      {site.phoneDisplay}
                    </a>
                  </div>
                </div>

                <div className="flex gap-4">
                  <MailIcon className="mt-1 h-4 w-4 shrink-0 text-bronze-light" />
                  <div>
                    <p className="text-[0.75rem] uppercase tracking-eyebrow text-stone">Email</p>
                    <a
                      href={mailLink}
                      className="mt-1.5 inline-flex min-h-[40px] items-center break-all text-[1.0625rem] text-paper transition-colors hover:text-bronze-light"
                    >
                      {site.email}
                    </a>
                  </div>
                </div>

                <div className="flex gap-4">
                  <ClockIcon className="mt-1 h-4 w-4 shrink-0 text-bronze-light" />
                  <div>
                    <p className="text-[0.75rem] uppercase tracking-eyebrow text-stone">Hours</p>
                    <p className="mt-1.5 text-[1.0625rem] leading-relaxed text-paper">
                      {site.hours.days}
                      <br />
                      {site.hours.time}
                    </p>
                  </div>
                </div>
              </address>
            </div>

            <p className="mt-8 text-[0.875rem] leading-relaxed text-mist">
              Translucent and high-gloss materials really do need to be seen lit. If the project
              allows it, visiting the showroom will save a round of samples.
            </p>
          </aside>
        </div>
      </section>

      <section className="pb-20">
        <div className="shell">
          <div className="aspect-[16/10] w-full border border-line bg-charcoal sm:aspect-[21/9]">
            <iframe
              src={site.mapsEmbed}
              title="Map showing T3 Media Corp at Begur Road, Bommanahalli, Bengaluru 560068"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-full w-full grayscale transition-[filter] duration-700 hover:grayscale-0"
            />
          </div>
        </div>
      </section>

      <StickyActions />
    </>
  );
}
