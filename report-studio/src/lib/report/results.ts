// Words for what a Meta campaign counted as a result. Every label and
// sentence about paid results is built from these, so a leads campaign reads
// as leads, a traffic campaign as clicks, and a messaging campaign as
// conversations. Nothing is assumed about a campaign beyond its result type.
import type { MetaAdsData, ResultType } from "./types.ts";

export type ResultFocus = "enquiry" | "traffic" | "sales" | "other";

export interface ResultWords {
  key: "messaging" | "leads" | "calls" | "clicks" | "lpv" | "purchases" | "other";
  /** "Messaging conversations", for labels. */
  Title: string;
  /** "messaging conversations", in sentences. */
  many: string;
  /** "conversations", the short plural once the kind is clear. */
  few: string;
  /** "conversation". */
  one: string;
  /** "messaging", as in "the messaging campaign". */
  kind: string;
  /** What one result means for the client. */
  meaning: string;
  focus: ResultFocus;
}

const W: Record<ResultWords["key"], ResultWords> = {
  messaging: { key: "messaging", Title: "Messaging conversations", many: "messaging conversations", few: "conversations", one: "conversation", kind: "messaging", meaning: "people raising a hand", focus: "enquiry" },
  leads: { key: "leads", Title: "Leads", many: "leads", few: "leads", one: "lead", kind: "lead generation", meaning: "people asking to be contacted", focus: "enquiry" },
  calls: { key: "calls", Title: "Calls", many: "calls", few: "calls", one: "call", kind: "call", meaning: "people phoning the business", focus: "enquiry" },
  clicks: { key: "clicks", Title: "Link clicks", many: "link clicks", few: "clicks", one: "click", kind: "traffic", meaning: "people visiting the website", focus: "traffic" },
  lpv: { key: "lpv", Title: "Landing page views", many: "landing page views", few: "landing page views", one: "landing page view", kind: "traffic", meaning: "people reaching the website", focus: "traffic" },
  purchases: { key: "purchases", Title: "Purchases", many: "purchases", few: "purchases", one: "purchase", kind: "sales", meaning: "purchases recorded by Meta, which are not the same as confirmed sales", focus: "sales" },
  other: { key: "other", Title: "Results", many: "results", few: "results", one: "result", kind: "current", meaning: "the results Meta recorded for the campaign objective", focus: "other" },
};

const BY_TYPE: Record<ResultType, ResultWords["key"]> = {
  "Messaging conversations": "messaging", Leads: "leads", Calls: "calls", "Link clicks": "clicks",
  "Landing page views": "lpv", Purchases: "purchases", "Other results": "other",
};

export function resultWords(m: Pick<MetaAdsData, "resultType">): ResultWords {
  // Reports saved before result types existed were all messaging campaigns.
  if (m.resultType === undefined) return W.messaging;
  return W[BY_TYPE[m.resultType as ResultType] ?? "other"];
}
