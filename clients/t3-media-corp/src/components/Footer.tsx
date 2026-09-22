import Link from 'next/link';
import { navigation, site } from '@/data/site';
import { products } from '@/data/products';
import { applications } from '@/data/applications';
import { Logo } from './Logo';
import { ClockIcon, MailIcon, PhoneIcon, PinIcon } from './Icons';
import { mailLink, telLink } from '@/lib/whatsapp';

export function Footer() {
  return (
    <footer className="bg-ink text-mist">
      <div className="shell py-20 lg:py-24">
        <div className="grid gap-14 lg:grid-cols-[1.3fr_1fr_1fr_1.1fr]">
          <div>
            <Logo invert />
            <p className="mt-7 max-w-xs text-[0.9375rem] leading-relaxed text-stone">
              Interior and architectural materials for designers, architects, furniture
              manufacturers and contractors across Bengaluru.
            </p>
            <p className="mt-6 font-display text-xl text-paper">{site.tagline}</p>
          </div>

          <nav aria-label="Products">
            <p className="eyebrow mb-5 text-stone">Products</p>
            <ul className="space-y-2.5">
              {products.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/products/${p.slug}/`}
                    className="text-[0.9375rem] text-mist transition-colors duration-200 hover:text-bronze-light"
                  >
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Applications">
            <p className="eyebrow mb-5 text-stone">Applications</p>
            <ul className="space-y-2.5">
              {applications.slice(0, 8).map((a) => (
                <li key={a.slug}>
                  <Link
                    href={`/applications/#${a.slug}`}
                    className="text-[0.9375rem] text-mist transition-colors duration-200 hover:text-bronze-light"
                  >
                    {a.name}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="eyebrow mb-5 mt-9 text-stone">Company</p>
            <ul className="space-y-2.5">
              {navigation
                .filter((n) => ['/about/', '/contact/'].includes(n.href))
                .map((n) => (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      className="text-[0.9375rem] text-mist transition-colors duration-200 hover:text-bronze-light"
                    >
                      {n.label}
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>

          <div>
            <p className="eyebrow mb-5 text-stone">Visit or Call</p>
            <address className="space-y-4 not-italic">
              <p className="flex gap-3 text-[0.9375rem] leading-relaxed text-mist">
                <PinIcon className="mt-1 h-4 w-4 shrink-0 text-bronze-light" />
                <span>
                  Begur Road, Bommanahalli
                  <br />
                  Bangalore – 560068
                  <br />
                  Karnataka, India
                </span>
              </p>
              <p className="flex gap-3">
                <PhoneIcon className="mt-0.5 h-4 w-4 shrink-0 text-bronze-light" />
                <a
                  href={telLink}
                  className="text-[0.9375rem] text-mist transition-colors hover:text-bronze-light"
                >
                  {site.phoneDisplay}
                </a>
              </p>
              <p className="flex gap-3">
                <MailIcon className="mt-0.5 h-4 w-4 shrink-0 text-bronze-light" />
                <a
                  href={mailLink}
                  className="break-all text-[0.9375rem] text-mist transition-colors hover:text-bronze-light"
                >
                  {site.email}
                </a>
              </p>
              <p className="flex gap-3 text-[0.9375rem] text-mist">
                <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-bronze-light" />
                <span>
                  {site.hours.days}
                  <br />
                  {site.hours.time}
                </span>
              </p>
            </address>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-white/10 pt-8 text-[0.8125rem] text-stone sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.legalName}. All rights reserved.
          </p>
          <p>Interior &amp; architectural material supplier — Bommanahalli, Bengaluru.</p>
        </div>
      </div>
    </footer>
  );
}
