import type { Metadata, Viewport } from 'next';
import { Bodoni_Moda, JetBrains_Mono, Manrope } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { JsonLd } from '@/components/JsonLd';
import { localBusinessSchema } from '@/lib/seo';
import { site } from '@/data/site';
import { SiteLoader } from '@/components/SiteLoader';
import { PageTransition } from '@/components/PageTransition';

// Bodoni Moda carries the optical-size axis, so the same family holds a 100px
// hero and a 24px sub-head without the thin strokes disappearing. Manrope is
// the working face. JetBrains Mono is reserved for labels, specs and counters.
const display = Bodoni_Moda({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-display',
});

const sans = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: 'T3 Media Corp | Interior & Architectural Materials in Bangalore',
    template: `%s`,
  },
  description: site.description,
  applicationName: site.name,
  keywords: [
    'interior materials Bangalore',
    'interior material supplier Bangalore',
    'architectural materials Bangalore',
    'acrylic sheets Bangalore',
    'acrylic laminates Bangalore',
    'alabaster sheets Bangalore',
    'WPC doors Bangalore',
    'PVC ply sheets Bangalore',
    'acrylic mirror sheets Bangalore',
    'digital glass Bangalore',
    'ACP Bangalore',
  ],
  authors: [{ name: site.name }],
  robots: { index: true, follow: true },
  alternates: { canonical: site.url },
  formatDetection: { telephone: true, address: true },
};

export const viewport: Viewport = {
  themeColor: '#F6F4F0',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-IN"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <head>
        {/* Marks the document as scripted before first paint, so the reveal
            animations may safely start from a hidden state. Without JS the
            rules never apply and every word stays visible. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body>
        <JsonLd data={localBusinessSchema()} />
        <SiteLoader />
        <Header />
        <PageTransition>
          <main id="main">{children}</main>
        </PageTransition>
        <Footer />
      </body>
    </html>
  );
}
