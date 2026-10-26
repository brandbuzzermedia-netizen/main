/**
 * Contact eligibility: may this organization contact this person on this channel, now?
 *
 * Every automated or manual outreach action must call evaluateEligibility() first and obey the
 * result. The rules encode a conservative reading of each market's marketing-contact rules.
 * They are decision support, not legal advice: tenants must confirm them with their own counsel,
 * and a "review" result exists exactly for the cases software cannot settle (registry checks
 * that are not integrated yet, unknown time zones, unknown countries).
 *
 * Bump RULESET_VERSION whenever a rule changes. The version is stored with every decision so
 * any past contact can be explained against the rules that applied at the time.
 */

export const RULESET_VERSION = "2026-10-26.1";

export const CHANNELS = ["email", "sms", "phone_call", "ai_voice_call", "whatsapp"] as const;
export type Channel = (typeof CHANNELS)[number];

export const BASES = ["express_written", "express", "implied_existing_relationship", "implied_inquiry", "legitimate_interest"] as const;
export type Basis = (typeof BASES)[number];

export type Decision = "allow" | "defer" | "review" | "block";

type Window = [start: string, end: string]; // "HH:MM" local time, end exclusive
type Hours = { weekday: Window; saturday: Window | null; sunday: Window | null };

type ChannelRule = {
  accepts: readonly Basis[];
  /** What happens when no accepted basis is on record. */
  withoutConsent: "review" | "block";
  /** Do-not-call registry that must be checked when relying on no consent. */
  registry?: string;
  /** Statutory local contact hours; the organization's own window is applied on top. */
  hours?: Hours;
  /** Maximum age of an implied-inquiry basis in this market, in days. */
  inquiryMaxDays?: number;
  basisNote: string;
};

type MarketRules = { name: string; rules: Record<Channel, ChannelRule> };

const EXPRESS = ["express_written", "express"] as const;
const EXPRESS_OR_IMPLIED = ["express_written", "express", "implied_existing_relationship", "implied_inquiry"] as const;
const ALL_DAY: Hours = { weekday: ["00:00", "24:00"], saturday: ["00:00", "24:00"], sunday: ["00:00", "24:00"] };

const US_HOURS: Hours = { weekday: ["08:00", "21:00"], saturday: ["08:00", "21:00"], sunday: ["08:00", "21:00"] };
const CA_HOURS: Hours = { weekday: ["09:00", "21:30"], saturday: ["10:00", "18:00"], sunday: ["10:00", "18:00"] };
const AU_HOURS: Hours = { weekday: ["09:00", "20:00"], saturday: ["09:00", "17:00"], sunday: null };
const AE_HOURS: Hours = { weekday: ["09:00", "18:00"], saturday: ["09:00", "18:00"], sunday: ["09:00", "18:00"] };

export const MARKET_RULES: Record<string, MarketRules> = {
  US: {
    name: "United States",
    rules: {
      email: {
        accepts: [...EXPRESS_OR_IMPLIED, "legitimate_interest"],
        withoutConsent: "review",
        basisNote: "CAN-SPAM allows commercial email without prior consent if it is honest and has a working unsubscribe. This platform still asks for a recorded basis before automation.",
      },
      sms: {
        accepts: ["express_written"],
        withoutConsent: "block",
        hours: US_HOURS,
        basisNote: "Marketing texts sent with automated systems need prior express written consent under the TCPA. Some states (e.g. Florida, Oklahoma) add stricter rules.",
      },
      phone_call: {
        accepts: EXPRESS_OR_IMPLIED,
        withoutConsent: "review",
        registry: "National Do Not Call Registry and state lists",
        hours: US_HOURS,
        inquiryMaxDays: 90,
        basisNote: "Live calls to numbers on the National DNC Registry need consent or an established business relationship (inquiry within 3 months).",
      },
      ai_voice_call: {
        accepts: ["express_written"],
        withoutConsent: "block",
        hours: US_HOURS,
        basisNote: "The FCC treats AI-generated voices as artificial voices under the TCPA (Feb 2024). Marketing calls need prior express written consent.",
      },
      whatsapp: {
        accepts: EXPRESS,
        withoutConsent: "block",
        hours: US_HOURS,
        basisNote: "WhatsApp Business requires an opt-in before business-initiated messages.",
      },
    },
  },
  GB: {
    name: "United Kingdom",
    rules: {
      email: {
        accepts: ["express_written", "express", "implied_existing_relationship"],
        withoutConsent: "block",
        basisNote: "PECR: marketing email to individuals needs consent, or the soft opt-in for existing customers. Legitimate interest is not enough.",
      },
      sms: {
        accepts: ["express_written", "express", "implied_existing_relationship"],
        withoutConsent: "block",
        basisNote: "PECR treats SMS like email: consent or soft opt-in.",
      },
      phone_call: {
        accepts: [...EXPRESS_OR_IMPLIED, "legitimate_interest"],
        withoutConsent: "review",
        registry: "Telephone Preference Service (TPS/CTPS)",
        basisNote: "Live marketing calls are allowed unless the number is on the TPS or has objected. Screen against the TPS first.",
      },
      ai_voice_call: {
        accepts: EXPRESS,
        withoutConsent: "block",
        basisNote: "PECR: automated marketing calls need specific prior consent.",
      },
      whatsapp: { accepts: EXPRESS, withoutConsent: "block", basisNote: "Needs an opt-in (PECR and WhatsApp policy)." },
    },
  },
  CA: {
    name: "Canada",
    rules: {
      email: {
        accepts: EXPRESS_OR_IMPLIED,
        withoutConsent: "block",
        inquiryMaxDays: 180,
        basisNote: "CASL: express consent, or implied consent (existing business relationship up to 2 years, inquiry up to 6 months).",
      },
      sms: {
        accepts: EXPRESS_OR_IMPLIED,
        withoutConsent: "block",
        inquiryMaxDays: 180,
        hours: CA_HOURS,
        basisNote: "CASL applies to text messages as well as email.",
      },
      phone_call: {
        accepts: EXPRESS_OR_IMPLIED,
        withoutConsent: "review",
        registry: "National Do Not Call List (DNCL)",
        hours: CA_HOURS,
        inquiryMaxDays: 180,
        basisNote: "CRTC Unsolicited Telecommunications Rules: check the National DNCL and call within permitted hours.",
      },
      ai_voice_call: {
        accepts: EXPRESS,
        withoutConsent: "block",
        hours: CA_HOURS,
        basisNote: "CRTC rules on automatic dialing-announcing devices require express consent for marketing.",
      },
      whatsapp: { accepts: EXPRESS, withoutConsent: "block", hours: CA_HOURS, basisNote: "CASL and WhatsApp opt-in policy." },
    },
  },
  AU: {
    name: "Australia",
    rules: {
      email: {
        accepts: EXPRESS_OR_IMPLIED,
        withoutConsent: "block",
        basisNote: "Spam Act 2003: express or inferred consent, sender identification and a functional unsubscribe.",
      },
      sms: {
        accepts: EXPRESS_OR_IMPLIED,
        withoutConsent: "block",
        hours: AU_HOURS,
        basisNote: "The Spam Act covers SMS as well as email.",
      },
      phone_call: {
        accepts: EXPRESS_OR_IMPLIED,
        withoutConsent: "review",
        registry: "Do Not Call Register",
        hours: AU_HOURS,
        basisNote: "Do Not Call Register Act 2006 and the Telemarketing Industry Standard: check the register, and no calls on Sundays or national public holidays.",
      },
      ai_voice_call: { accepts: EXPRESS, withoutConsent: "block", hours: AU_HOURS, basisNote: "Recorded or synthetic marketing calls: require express consent." },
      whatsapp: { accepts: EXPRESS, withoutConsent: "block", hours: AU_HOURS, basisNote: "Spam Act and WhatsApp opt-in policy." },
    },
  },
  AE: {
    name: "United Arab Emirates",
    rules: {
      email: {
        accepts: ["express_written", "express", "implied_existing_relationship"],
        withoutConsent: "block",
        basisNote: "Conservative default under the UAE PDPL. Confirm with UAE counsel.",
      },
      sms: { accepts: EXPRESS, withoutConsent: "block", hours: AE_HOURS, basisNote: "TDRA rules apply to marketing SMS. Confirm with UAE counsel." },
      phone_call: {
        accepts: EXPRESS_OR_IMPLIED,
        withoutConsent: "review",
        registry: "TDRA Do Not Call Registry",
        hours: AE_HOURS,
        basisNote: "UAE telemarketing rules (2024) restrict calling hours and frequency and require respecting the DNCR. Confirm details with UAE counsel.",
      },
      ai_voice_call: { accepts: EXPRESS, withoutConsent: "block", hours: AE_HOURS, basisNote: "Conservative default: express consent for automated calls." },
      whatsapp: { accepts: EXPRESS, withoutConsent: "block", hours: AE_HOURS, basisNote: "Needs an opt-in." },
    },
  },
};

/** Strict default for any country without its own rules. */
const DEFAULT_RULES: MarketRules = {
  name: "Other country",
  rules: (() => {
    const strict: ChannelRule = { accepts: EXPRESS, withoutConsent: "block", basisNote: "No market-specific rules are configured, so express consent is required." };
    return { email: strict, sms: strict, phone_call: strict, ai_voice_call: strict, whatsapp: strict };
  })(),
};

export type ConsentState = {
  status: "granted" | "withdrawn";
  basis: Basis | "none_recorded";
  capturedAt: Date;
  expiresAt: Date | null;
};

export type EligibilityInput = {
  channel: Channel;
  /** Recipient's country (ISO alpha-2). Null when unknown. */
  country: string | null;
  /** Recipient's IANA time zone. Null when unknown. */
  timezone: string | null;
  hasContactValue: boolean;
  /** Suppressed for every channel, or for this channel specifically. */
  suppressed: boolean;
  optedOutStage: boolean;
  consent: ConsentState | undefined;
  now: Date;
  orgWindow: { start: string; end: string };
  impliedInquiryDays: number;
};

export type Reason = { code: string; message: string };

export type EligibilityResult = {
  decision: Decision;
  reasons: Reason[];
  basisNote: string;
  market: string;
  rulesetVersion: string;
  /** For "defer": the earliest time contact becomes allowed (within the next 8 days). */
  notBefore?: Date;
};

const RANK: Record<Decision, number> = { allow: 0, defer: 1, review: 2, block: 3 };

export function rulesFor(country: string | null): { market: string; rules: MarketRules } {
  const code = country?.toUpperCase() ?? null;
  if (code && MARKET_RULES[code]) return { market: code, rules: MARKET_RULES[code] };
  return { market: code ?? "unknown", rules: DEFAULT_RULES };
}

export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const { market, rules } = rulesFor(input.country);
  const rule = rules.rules[input.channel];
  const reasons: Reason[] = [];
  // Widened explicitly: TypeScript cannot see the closure below raising it.
  let decision = "allow" as Decision;
  let notBefore: Date | undefined;
  const raise = (d: Decision, code: string, message: string) => {
    if (RANK[d] > RANK[decision]) decision = d;
    reasons.push({ code, message });
  };

  if (!input.hasContactValue) raise("block", "no_contact_value", `No ${input.channel === "email" ? "email address" : "phone number"} on record.`);
  if (input.suppressed) raise("block", "suppressed", "This contact is on the suppression list for this channel.");
  if (input.optedOutStage) raise("block", "opted_out", "The lead is in the Opted out stage.");
  if (!input.country) raise("review", "unknown_country", "The recipient's country is unknown, so the strictest rules apply and a person must confirm.");

  // Consent / legal basis.
  const c = input.consent;
  if (c?.status === "withdrawn") {
    raise("block", "consent_withdrawn", `Consent for ${label(input.channel)} was withdrawn on ${c.capturedAt.toISOString().slice(0, 10)}.`);
  } else {
    let basis: Basis | null = c?.status === "granted" && c.basis !== "none_recorded" ? c.basis : null;
    if (basis && c?.expiresAt && c.expiresAt <= input.now) {
      reasons.push({ code: "consent_expired", message: "The recorded consent has expired." });
      basis = null;
    }
    if (basis === "implied_inquiry" && c) {
      const maxDays = Math.min(input.impliedInquiryDays, rule.inquiryMaxDays ?? Infinity);
      if (input.now.getTime() - c.capturedAt.getTime() > maxDays * 86_400_000) {
        reasons.push({ code: "inquiry_stale", message: `The enquiry is older than ${maxDays} days, so it no longer counts as implied consent here.` });
        basis = null;
      }
    }
    if (!basis || !rule.accepts.includes(basis)) {
      const have = basis ? `The recorded basis (${basis.replaceAll("_", " ")}) is not sufficient.` : "No consent or other basis is recorded.";
      if (rule.withoutConsent === "block") {
        raise("block", "no_basis", `${have} ${label(input.channel)} in ${rules.name} needs: ${rule.accepts.map((b) => b.replaceAll("_", " ")).join(" or ")}.`);
      } else if (rule.registry) {
        raise("review", "registry_check", `${have} Check the ${rule.registry} before contacting. Registry screening is not connected yet.`);
      } else {
        raise("review", "no_basis", `${have} A person must confirm the basis before contacting.`);
      }
    }
  }

  // Contact hours for real-time channels.
  if (input.channel !== "email") {
    const hours = intersect(rule.hours ?? ALL_DAY, input.orgWindow);
    if (!input.timezone || !isValidTimeZone(input.timezone)) {
      raise("review", "unknown_timezone", "The recipient's time zone is unknown, so permitted contact hours cannot be checked.");
    } else if (!withinHours(hours, input.now, input.timezone)) {
      notBefore = nextAllowed(hours, input.now, input.timezone);
      raise("defer", "outside_hours", `It is outside permitted contact hours for the recipient (${describeHours(hours)}, their local time).`);
    }
  }

  return { decision, reasons, basisNote: rule.basisNote, market, rulesetVersion: RULESET_VERSION, notBefore: decision === "defer" ? notBefore : undefined };
}

function label(channel: Channel): string {
  return { email: "Marketing email", sms: "Marketing SMS", phone_call: "A marketing call", ai_voice_call: "An AI voice call", whatsapp: "WhatsApp marketing" }[channel];
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

function clip(w: Window | null, org: { start: string; end: string }): Window | null {
  if (!w) return null;
  const start = Math.max(toMinutes(w[0]), toMinutes(org.start));
  const end = Math.min(toMinutes(w[1]), toMinutes(org.end));
  if (end <= start) return null;
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return [fmt(start), fmt(end)];
}

/** The stricter of statutory hours and the organization's own window. */
export function intersect(h: Hours, org: { start: string; end: string }): Hours {
  return { weekday: clip(h.weekday, org) ?? ["00:00", "00:00"], saturday: clip(h.saturday, org), sunday: clip(h.sunday, org) };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function localParts(at: Date, timeZone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function windowFor(h: Hours, weekday: number): Window | null {
  return weekday === 0 ? h.sunday : weekday === 6 ? h.saturday : h.weekday;
}

export function withinHours(h: Hours, at: Date, timeZone: string): boolean {
  const { weekday, minutes } = localParts(at, timeZone);
  const w = windowFor(h, weekday);
  return Boolean(w && minutes >= toMinutes(w[0]) && minutes < toMinutes(w[1]));
}

/** Earliest allowed moment within the next 8 days, scanning in 15-minute steps. */
export function nextAllowed(h: Hours, from: Date, timeZone: string): Date | undefined {
  const step = 15 * 60_000;
  let t = Math.ceil(from.getTime() / step) * step;
  for (let i = 0; i < (8 * 24 * 60) / 15; i++, t += step) {
    if (withinHours(h, new Date(t), timeZone)) return new Date(t);
  }
  return undefined;
}

export function describeHours(h: Hours): string {
  const w = (x: Window | null) => (x ? `${x[0]}–${x[1]}` : "none");
  if (w(h.weekday) === w(h.saturday) && w(h.saturday) === w(h.sunday)) return `daily ${w(h.weekday)}`;
  return `Mon–Fri ${w(h.weekday)}, Sat ${w(h.saturday)}, Sun ${w(h.sunday)}`;
}
