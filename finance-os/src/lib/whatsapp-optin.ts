/** WhatsApp opt-in: people message us first with START; STOP opts them out. */
export const optInText = (company: string) => `START - please send me updates from ${company} on WhatsApp`;
export const waLink = (numberE164: string, company: string) => `https://wa.me/${numberE164.replace(/\D/g, "")}?text=${encodeURIComponent(optInText(company))}`;
export const isOptOut = (text: string) => /^\s*(stop|unsubscribe|opt[ -]?out|band karo|cancel)\b/i.test(text);
export const isOptIn = (text: string) => /^\s*start\b/i.test(text);
