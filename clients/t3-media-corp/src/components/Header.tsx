'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { navigation, site } from '@/data/site';
import { products, productCategories } from '@/data/products';
import { Logo } from './Logo';
import { ArrowIcon, PhoneIcon } from './Icons';
import { telLink } from '@/lib/whatsapp';

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close both menus on navigation.
  useEffect(() => {
    setMenuOpen(false);
    setMegaOpen(false);
  }, [pathname]);

  // Lock the page behind the mobile drawer, and let Escape close it.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setMegaOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ease-editorial ${
        scrolled || megaOpen
          ? 'border-b border-mist bg-paper/95 backdrop-blur-md'
          : 'border-b border-transparent bg-paper'
      }`}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        Skip to content
      </a>

      <div className="shell flex h-[72px] items-center justify-between gap-6 lg:h-[88px]">
        <Link href="/" aria-label={`${site.name} home`}>
          <Logo />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-9 lg:flex">
          {navigation.map((item) => {
            const hasMega = item.href === '/products/';
            return (
              <div
                key={item.href}
                className="relative"
                onMouseEnter={hasMega ? () => setMegaOpen(true) : undefined}
                onMouseLeave={hasMega ? () => setMegaOpen(false) : undefined}
              >
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  aria-expanded={hasMega ? megaOpen : undefined}
                  className={`relative py-2 text-[0.8125rem] font-medium uppercase tracking-eyebrow transition-colors duration-200 ${
                    isActive(item.href) ? 'text-ink' : 'text-slate hover:text-ink'
                  }`}
                >
                  {item.label}
                  <span
                    className={`absolute -bottom-0.5 left-0 h-px w-full origin-left bg-ink transition-transform duration-500 ease-editorial ${
                      isActive(item.href) ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />
                </Link>

                {hasMega && megaOpen && (
                  <div className="absolute left-1/2 top-full z-50 w-screen max-w-[76rem] -translate-x-1/2 pt-5">
                    <div className="animate-rise border border-mist bg-paper shadow-[0_28px_60px_-28px_rgba(11,11,12,0.35)]">
                      <div className="grid gap-x-10 gap-y-8 p-10 md:grid-cols-4 lg:grid-cols-5">
                        {productCategories.map((cat) => (
                          <div key={cat}>
                            <p className="eyebrow mb-4 text-muted">{cat}</p>
                            <ul className="space-y-2.5">
                              {products
                                .filter((p) => p.category === cat)
                                .map((p) => (
                                  <li key={p.slug}>
                                    <Link
                                      href={`/products/${p.slug}/`}
                                      className="text-[0.9375rem] text-graphite transition-colors duration-200 hover:text-bronze"
                                    >
                                      {p.name}
                                    </Link>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between border-t border-mist bg-bone px-10 py-5">
                        <p className="max-w-md text-sm text-slate">
                          Not sure which material fits the brief? Send us the drawing and we will
                          tell you what works.
                        </p>
                        <Link href="/products/" className="link-line">
                          View full catalogue <ArrowIcon />
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <a
            href={telLink}
            className="flex min-h-[44px] items-center gap-2 px-1 text-[0.8125rem] font-medium text-graphite transition-colors hover:text-bronze"
          >
            <PhoneIcon />
            {site.phoneDisplay}
          </a>
          <Link href="/contact/" className="btn-primary">
            Get a Quote
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          className="-mr-2 flex h-12 w-12 items-center justify-center lg:hidden"
        >
          <span className="relative block h-3.5 w-6">
            <span
              className={`absolute left-0 block h-px w-full bg-ink transition-all duration-300 ease-editorial ${
                menuOpen ? 'top-1.5 rotate-45' : 'top-0'
              }`}
            />
            <span
              className={`absolute left-0 top-1.5 block h-px w-full bg-ink transition-opacity duration-200 ${
                menuOpen ? 'opacity-0' : 'opacity-100'
              }`}
            />
            <span
              className={`absolute left-0 block h-px w-full bg-ink transition-all duration-300 ease-editorial ${
                menuOpen ? 'top-1.5 -rotate-45' : 'top-3'
              }`}
            />
          </span>
        </button>
      </div>

      {/* Mobile drawer */}
      <div
        id="mobile-nav"
        hidden={!menuOpen}
        className="fixed inset-x-0 bottom-0 top-[72px] z-40 overflow-y-auto overscroll-contain border-t border-mist bg-paper pb-32 lg:hidden"
      >
        <nav aria-label="Mobile" className="shell py-8">
          <ul className="space-y-1">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block border-b border-mist py-4 font-display text-[1.75rem] tracking-tight text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <p className="eyebrow mt-10 text-muted">Product Categories</p>
          <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
            {products.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/products/${p.slug}/`}
                  className="block py-1 text-[0.9375rem] text-graphite"
                >
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>

          <Link href="/contact/" className="btn-primary mt-10 w-full">
            Get a Quote
          </Link>
        </nav>
      </div>
    </header>
  );
}
