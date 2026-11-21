import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mergeAiDraft, parsePriceLines, priceLines, ProposalDocSchema, templateDoc, totals } from "@/lib/gbs-proposal";
import { normaliseUrl, readHtml } from "@/lib/company-research";

const input = { company: "Bloom Salon", industry: "Salon", city: "Bengaluru", contact: "Asha", notes: "", research: null,
  services: [{ key: "performance" as const, amount: 25000 }, { key: "automation" as const, amount: 40000 }] };

describe("GBS proposal content", () => {
  it("the template is a valid proposal with the typed prices", () => {
    const doc = templateDoc(input);
    expect(ProposalDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.phases.map((p) => p.title)).toEqual(["Performance Marketing", "Lead Automation"]);
    expect(totals(doc.pricing.rows)).toEqual({ once: 40000, monthly: 25000, firstMonth: 65000 });
    expect(doc.prepared_for).toEqual(["Salon · Bengaluru", "Attn: Asha"]);
  });
  it("price lines round-trip and tolerate ₹ and commas", () => {
    const rows = templateDoc(input).pricing.rows;
    expect(parsePriceLines(priceLines(rows))).toEqual(rows);
    expect(parsePriceLines("SEO | local | ₹15,000 | monthly\nWebsite | build | 45000 | one time")).toEqual([
      { service: "SEO", scope: "local", amount: 15000, billing: "Monthly" }, { service: "Website", scope: "build", amount: 45000, billing: "One-Time" }]);
  });
  it("AI text is used where it fits, but prices and terms always stay GBS's own", () => {
    const base = templateDoc(input);
    const ai = { ...base, tags: ["ADS"], subtitle: "AI subtitle", pricing_intro: "AI intro", terms: ["AI term 1", "AI term 2"], opportunity: { ...base.opportunity, headline: "AI Headline" } };
    const merged = mergeAiDraft(ai, base);
    expect(merged.opportunity.headline).toBe("AI Headline");
    expect(merged.pricing.intro).toBe("AI intro");
    expect(merged.pricing.rows).toEqual(base.pricing.rows);
    expect(merged.terms).toEqual(base.terms);
  });
  it("falls back to the template when the AI draft does not fit the format", () => {
    const base = templateDoc(input);
    const bad = { ...base, pricing_intro: "", subtitle: "x".repeat(500), opportunity: { ...base.opportunity } };
    expect(mergeAiDraft(bad, base)).toEqual(base);
    expect(mergeAiDraft(null, base)).toBe(base);
  });
});

describe("company research helpers", () => {
  it("normalises typed website addresses and refuses odd ones", () => {
    expect(normaliseUrl("acme.in")).toBe("https://acme.in/");
    expect(normaliseUrl("http://www.acme.in/about")).toBe("http://www.acme.in/about");
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseUrl("https://user:pw@acme.in")).toBeNull();
    expect(normaliseUrl("https://acme.in:8080")).toBeNull();
    expect(normaliseUrl("localhost")).toBeNull();
  });
  it("reads title, description, headings, contacts and social links from a page", () => {
    const html = `<html><head><title>Bloom Salon &amp; Spa</title><meta name="description" content="Hair and skin studio in Indiranagar"></head>
      <body><script>evil()</script><h1>Look your best</h1><p>We are a family-run salon serving Bengaluru since 2012 with expert stylists.</p>
      <a href="mailto:hi@bloom.in">mail</a><a href="tel:+919800000000">call</a><a href="https://instagram.com/bloom?x=1">ig</a></body></html>`;
    const f = readHtml(html, "https://bloom.in/");
    expect(f.title).toBe("Bloom Salon & Spa");
    expect(f.description).toBe("Hair and skin studio in Indiranagar");
    expect(f.headings).toEqual(["Look your best"]);
    expect(f.text).toContain("family-run salon");
    expect(f.text).not.toContain("evil");
    expect(f.emails).toEqual(["hi@bloom.in"]);
    expect(f.phones).toEqual(["+919800000000"]);
    expect(f.social).toEqual(["https://instagram.com/bloom"]);
  });
});
