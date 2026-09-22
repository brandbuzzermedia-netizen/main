import { site } from '@/data/site';

/**
 * Builds a wa.me deep link with the message pre-filled. Passing a product name
 * means the enquiry arrives already saying what it is about, which is the
 * difference between a lead and a "hi".
 */
export function whatsappLink(productName?: string): string {
  const message = productName
    ? `Hi ${site.name}, I am interested in your ${productName}. Please share the details and pricing.`
    : `Hi ${site.name}, I would like to enquire about your interior materials. Please share the details and pricing.`;

  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(message)}`;
}

export const telLink = `tel:${site.phone}`;
export const mailLink = `mailto:${site.email}`;
