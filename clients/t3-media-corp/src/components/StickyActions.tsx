'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { telLink, whatsappLink } from '@/lib/whatsapp';
import { PhoneIcon, QuoteIcon, WhatsAppIcon } from './Icons';

/**
 * Two conversion surfaces that follow the visitor:
 *  - a floating WhatsApp button on tablet and desktop
 *  - a three-up sticky bar on mobile (WhatsApp | Call | Get Quote)
 *
 * `productName` pre-fills the WhatsApp message on product pages so the enquiry
 * arrives already saying what it is about.
 */
export function StickyActions({ productName }: { productName?: string }) {
  const [shown, setShown] = useState(false);
  const href = whatsappLink(productName);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 420);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={
          productName
            ? `Enquire about ${productName} on WhatsApp`
            : 'Enquire on WhatsApp'
        }
        className={`fixed bottom-7 right-7 z-40 hidden h-14 w-14 items-center justify-center rounded-full bg-[#0F8038] text-white shadow-[0_14px_36px_-10px_rgba(15,128,56,0.55)] transition-all duration-500 ease-editorial hover:bg-[#0C6B2F] md:flex ${
          shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
      >
        <WhatsAppIcon className="h-7 w-7" />
      </a>

      <nav
        aria-label="Quick contact"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-ink/10 bg-paper/95 backdrop-blur-md md:hidden"
      >
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[60px] flex-col items-center justify-center gap-1 border-r border-ink/10 text-[0.6875rem] font-medium uppercase tracking-eyebrow text-[#0B6B2E]"
        >
          <WhatsAppIcon className="h-5 w-5" />
          WhatsApp
        </a>
        <a
          href={telLink}
          className="flex min-h-[60px] flex-col items-center justify-center gap-1 border-r border-ink/10 text-[0.6875rem] font-medium uppercase tracking-eyebrow text-graphite"
        >
          <PhoneIcon className="h-5 w-5" />
          Call
        </a>
        <Link
          href="/contact/"
          className="flex min-h-[60px] flex-col items-center justify-center gap-1 bg-ink text-[0.6875rem] font-medium uppercase tracking-eyebrow text-paper"
        >
          <QuoteIcon className="h-5 w-5" />
          Get Quote
        </Link>
      </nav>

      {/* Keeps the sticky bar from covering the end of the page on mobile. */}
      <div aria-hidden="true" className="h-[60px] md:hidden" />
    </>
  );
}
