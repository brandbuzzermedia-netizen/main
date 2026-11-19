/**
 * Line icons for the whole OS (no emoji). 24×24, drawn with the current text colour,
 * so they pick up each company's brand colours wherever they sit.
 */
const P: Record<string, string> = {
  // Menu
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5",
  outreach: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z",
  leads: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  pipeline: "M4 4h4v16H4zM10 4h4v11h-4zM16 4h4v7h-4z",
  meetings: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  customers: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3",
  operations: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15.1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.3 8.2l-.1-.1A2 2 0 1 1 7 5.3l.1.1A1.7 1.7 0 0 0 10 4.2V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  marketing: "M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1ZM17 9a3 3 0 0 1 0 6M20 6a7 7 0 0 1 0 12",
  automation: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  finance: "M7 4h10M7 8h10M7 4c4 0 6 1.5 6 4s-2 4-6 4l7 8",
  team: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3",
  reports: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  vault: "M3 4h18v5H3zM5 9v11h14V9M10 13h4",
  settings: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  research: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-5-5",
  followups: "M4 4h16v16H4zM8 12l3 3 5-6",
  proposals: "M14 3H6v18h12V7l-4-4ZM14 3v4h4M9 13h6M9 17h6",
  invoices: "M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6",
  rental: "M3 21h18M5 21V8l7-5 7 5v13M10 21v-6h4v6",
  expenses: "M2 6h20v12H2zM2 10h20M6 15h4",
  tax: "M19 5 5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  admin: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3ZM9 12l2 2 4-4",
  // Activity and achievements
  trophy: "M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6",
  plus: "M12 5v14M5 12h14",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
  check: "M5 12l5 5 9-10",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
  rupee: "M7 4h10M7 8h10M7 4c4 0 6 1.5 6 4s-2 4-6 4l7 8",
  userPlus: "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 21a7 7 0 0 1 14 0M19 8v6M16 11h6",
  heart: "M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9Z",
  layers: "M12 3 2 8l10 5 10-5-10-5ZM2 13l10 5 10-5M2 17.5 12 22l10-4.5",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12h0",
  phone: "M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2Z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  clap: "M7 11V5.5a1.5 1.5 0 0 1 3 0V10M10 9V4.5a1.5 1.5 0 0 1 3 0V10M13 9.5V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.6-1.5L7 13",
};
/** Activity kinds → icons. */
export const KIND_GLYPH: Record<string, string> = { deal_won: "trophy", deal_created: "plus", proposal_sent: "mail", proposal_accepted: "check", meeting_booked: "meetings",
  task_done: "followups", positive_reply: "star", payment_received: "rupee", member_joined: "userPlus", kudos: "heart" };

export function Glyph({ name, size = 18, stroke = 1.8, title }: { name: string; size?: number; stroke?: number; title?: string }) {
  const d = P[name] ?? P[name.replace(/s$/, "")];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d={d} />
    </svg>
  );
}
export const hasGlyph = (name: string) => Boolean(P[name]);
