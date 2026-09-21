import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Inter_Tight } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { JsonLd } from '@/components/JsonLd';
import { localBusinessSchema } from '@/lib/seo';
import { site } from '@/data/site';

const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-display',
});

const sans = Inter_Tight({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
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
    <html lang="en-IN" className={`${display.variable} ${sans.variable}`}>
      <body>
        <JsonLd data={localBusinessSchema()} />
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
