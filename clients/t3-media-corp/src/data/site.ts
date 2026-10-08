/**
 * Single source of truth for company facts, contact routes and SEO defaults.
 * Every figure here is taken from the client's existing website or brief —
 * nothing is inferred. Placeholders are marked `PLACEHOLDER` so they are easy
 * to find and replace.
 */

export const site = {
  name: 'T3 Media Corp',
  legalName: 'T3 Media Corp',
  tagline: 'We Make Living Better',
  /** Update once the new site is live on its final domain. */
  url: 'https://www.t3products.in',
  description:
    'Interior and architectural materials supplier in Bengaluru. Acrylic laminates, alabaster sheets, WPC doors, acrylic and mirror sheets, digital glass, PVC ply, ACP and CNC cutting.',

  address: {
    street: 'Begur Road, Bommanahalli',
    locality: 'Bengaluru',
    region: 'Karnataka',
    postalCode: '560068',
    country: 'IN',
    full: 'Begur Road, Bommanahalli, Bangalore – 560068, Karnataka, India',
  },

  /** E.164 for tel:/wa.me, plus a readable form for display. */
  phone: '+916363786330',
  phoneDisplay: '+91 63637 86330',
  whatsapp: '916363786330',
  email: 't3.media.corp@gmail.com',

  hours: {
    days: 'Monday – Saturday',
    time: '10:00 AM – 7:00 PM',
    /** schema.org openingHours shorthand */
    schema: 'Mo-Sa 10:00-19:00',
  },

  /**
   * PLACEHOLDER — swap for the client's own Google Business Profile embed URL
   * so the pin lands exactly on the showroom entrance.
   */
  mapsEmbed:
    'https://www.google.com/maps?q=Begur%20Road%2C%20Bommanahalli%2C%20Bengaluru%20560068&output=embed',
  mapsDirections:
    'https://www.google.com/maps/dir/?api=1&destination=Begur+Road,+Bommanahalli,+Bengaluru,+Karnataka+560068',
} as const;

export const audiences = [
  'Interior Designers',
  'Architects',
  'Furniture Manufacturers',
  'Contractors',
  'Builders',
  'Commercial Project Developers',
  'Modular Furniture Companies',
  'Retail & Hospitality',
  'Homeowners',
] as const;

/** The six strengths the existing site leads with, rewritten as web copy. */
export const strengths = [
  {
    title: 'Cost-Effectiveness',
    body: 'Trade pricing on every category, so specification decisions hold up when the budget is reviewed.',
  },
  {
    title: 'Comprehensive Selection',
    body: 'Surfaces, panels, doors and glass under one roof — fewer suppliers to chase across a single project.',
  },
  {
    title: 'Customer-Centric Approach',
    body: 'Direct answers on suitability, availability and lead time from people who handle the material daily.',
  },
  {
    title: 'High-Quality Material',
    body: 'Stock is selected for finish consistency and durability, because a surface is judged years after handover.',
  },
  {
    title: 'Diverse Product Range',
    body: 'From translucent alabaster to exterior ACP, the range covers both decorative and structural briefs.',
  },
  {
    title: 'Precision Finishing',
    body: 'In-house CNC cutting turns sheet stock into finished components cut to your drawing.',
  },
] as const;

export const navigation = [
  { label: 'Home', href: '/' },
  { label: 'Products', href: '/products/' },
  { label: 'Applications', href: '/applications/' },
  { label: 'About', href: '/about/' },
  { label: 'Contact', href: '/contact/' },
] as const;
