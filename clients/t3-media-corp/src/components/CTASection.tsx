import Link from 'next/link';
import { telLink, whatsappLink } from '@/lib/whatsapp';
import { site } from '@/data/site';
import { MaterialPlate } from './MaterialPlate';
import { PhoneIcon, WhatsAppIcon } from './Icons';

export function CTASection({
  title = 'Looking for the right material for your next project?',
  body = 'Talk to our team about your requirements. Send a drawing, an area schedule or a reference image and we will tell you what works and what is in stock.',
  productName,
  plate = 'materials-lab',
}: {
  title?: string;
  body?: string;
  productName?: string;
  plate?: string;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-charcoal text-paper">
      <MaterialPlate
        plate={plate}
        alt=""
        className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/90 to-ink/55" />

      <div className="shell section">
        <div className="max-w-2xl">
          <p className="eyebrow text-bronze-light">Get in touch</p>
          <h2 className="display-2 mt-6 text-paper">{title}</h2>
          <p className="lede mt-6 text-mist">{body}</p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/contact/" className="btn-invert">
              Get a Quote
            </Link>
            <a
              href={whatsappLink(productName)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp"
            >
              <WhatsAppIcon />
              {productName ? 'Enquire on WhatsApp' : 'WhatsApp Us'}
            </a>
            <a href={telLink} className="btn-ghost-invert">
              <PhoneIcon />
              Call Now
            </a>
          </div>

          <p className="mt-8 text-[0.8125rem] text-stone">
            {site.hours.days}, {site.hours.time} · {site.phoneDisplay}
          </p>
        </div>
      </div>
    </section>
  );
}
