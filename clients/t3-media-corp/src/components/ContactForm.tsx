'use client';

import { useMemo, useState } from 'react';
import { products } from '@/data/products';
import { site } from '@/data/site';
import { MailIcon, WhatsAppIcon } from './Icons';

const PROJECT_TYPES = [
  'Residential interior',
  'Commercial / office interior',
  'Hospitality',
  'Retail',
  'Furniture manufacturing',
  'New construction / builder project',
  'Other',
];

type Fields = {
  name: string;
  phone: string;
  email: string;
  company: string;
  projectType: string;
  product: string;
  message: string;
};

const EMPTY: Fields = {
  name: '',
  phone: '',
  email: '',
  company: '',
  projectType: '',
  product: '',
  message: '',
};

/**
 * The site is a static export, so there is no server to post to. Rather than
 * ship a form that silently goes nowhere, the enquiry is composed into a
 * WhatsApp message (the client's main lead channel) with an email fallback.
 *
 * To add a hosted form endpoint later, POST `fields` from `handleSubmit` and
 * keep the WhatsApp route as the secondary action — it converts better.
 */
export function ContactForm({ defaultProduct }: { defaultProduct?: string }) {
  const [fields, setFields] = useState<Fields>({ ...EMPTY, product: defaultProduct ?? '' });
  const [touched, setTouched] = useState(false);

  const errors = useMemo(() => {
    const e: Partial<Record<keyof Fields, string>> = {};
    if (!fields.name.trim()) e.name = 'Please enter your name.';
    if (!/^[\d+\s()-]{8,}$/.test(fields.phone.trim())) e.phone = 'Please enter a valid phone number.';
    if (fields.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.email.trim()))
      e.email = 'Please enter a valid email address.';
    if (!fields.message.trim()) e.message = 'Tell us a little about the requirement.';
    return e;
  }, [fields]);

  const valid = Object.keys(errors).length === 0;

  const body = useMemo(() => {
    const lines = [
      `Hi ${site.name}, I would like to request a quote.`,
      '',
      `Name: ${fields.name || '—'}`,
      `Phone: ${fields.phone || '—'}`,
      fields.email ? `Email: ${fields.email}` : null,
      fields.company ? `Company: ${fields.company}` : null,
      fields.projectType ? `Project type: ${fields.projectType}` : null,
      fields.product ? `Product of interest: ${fields.product}` : null,
      '',
      fields.message,
    ].filter(Boolean);
    return lines.join('\n');
  }, [fields]);

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    window.open(
      `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(body)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const mailHref = `mailto:${site.email}?subject=${encodeURIComponent(
    `Quote request${fields.product ? ` — ${fields.product}` : ''}`,
  )}&body=${encodeURIComponent(body)}`;

  const err = (key: keyof Fields) => (touched ? errors[key] : undefined);

  const fieldClass = (key: keyof Fields) =>
    `w-full border bg-transparent px-4 py-3.5 text-[0.9375rem] text-paper transition-colors duration-200 placeholder:text-stone focus:border-bronze-light focus:outline-none ${
      err(key) ? 'border-red-600' : 'border-line'
    }`;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="eyebrow mb-2.5 block text-stone">
            Name <span className="text-bronze-light">*</span>
          </label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            value={fields.name}
            onChange={set('name')}
            aria-invalid={!!err('name')}
            aria-describedby={err('name') ? 'name-error' : undefined}
            className={fieldClass('name')}
            placeholder="Your full name"
          />
          {err('name') && (
            <p id="name-error" className="mt-2 text-[0.8125rem] text-red-700">
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="phone" className="eyebrow mb-2.5 block text-stone">
            Phone <span className="text-bronze-light">*</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={fields.phone}
            onChange={set('phone')}
            aria-invalid={!!err('phone')}
            aria-describedby={err('phone') ? 'phone-error' : undefined}
            className={fieldClass('phone')}
            placeholder="+91"
          />
          {err('phone') && (
            <p id="phone-error" className="mt-2 text-[0.8125rem] text-red-700">
              {errors.phone}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="eyebrow mb-2.5 block text-stone">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={fields.email}
            onChange={set('email')}
            aria-invalid={!!err('email')}
            aria-describedby={err('email') ? 'email-error' : undefined}
            className={fieldClass('email')}
            placeholder="you@company.com"
          />
          {err('email') && (
            <p id="email-error" className="mt-2 text-[0.8125rem] text-red-700">
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="company" className="eyebrow mb-2.5 block text-stone">
            Company / Studio
          </label>
          <input
            id="company"
            name="company"
            autoComplete="organization"
            value={fields.company}
            onChange={set('company')}
            className={fieldClass('company')}
            placeholder="Optional"
          />
        </div>

        <div>
          <label htmlFor="projectType" className="eyebrow mb-2.5 block text-stone">
            Project type
          </label>
          <select
            id="projectType"
            name="projectType"
            value={fields.projectType}
            onChange={set('projectType')}
            className={fieldClass('projectType')}
          >
            <option value="">Select a project type</option>
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="product" className="eyebrow mb-2.5 block text-stone">
            Product of interest
          </label>
          <select
            id="product"
            name="product"
            value={fields.product}
            onChange={set('product')}
            className={fieldClass('product')}
          >
            <option value="">Select a product</option>
            {products.map((p) => (
              <option key={p.slug} value={p.name}>
                {p.name}
              </option>
            ))}
            <option value="Multiple / not sure yet">Multiple / not sure yet</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="message" className="eyebrow mb-2.5 block text-stone">
          Message <span className="text-bronze-light">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          value={fields.message}
          onChange={set('message')}
          aria-invalid={!!err('message')}
          aria-describedby={err('message') ? 'message-error' : undefined}
          className={fieldClass('message')}
          placeholder="Quantities, sizes, site location, timeline — whatever you have."
        />
        {err('message') && (
          <p id="message-error" className="mt-2 text-[0.8125rem] text-red-700">
            {errors.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row">
        <button type="submit" className="btn-whatsapp flex-1">
          <WhatsAppIcon />
          Request a Quote
        </button>
        <a href={mailHref} className="btn-outline flex-1">
          <MailIcon />
          Send by Email
        </a>
      </div>

      <p className="text-[0.8125rem] leading-relaxed text-stone">
        Your enquiry opens in WhatsApp with the details already filled in, so nothing gets lost in
        a form queue. Prefer email? Use the second button — it does the same thing in your mail app.
      </p>
    </form>
  );
}
