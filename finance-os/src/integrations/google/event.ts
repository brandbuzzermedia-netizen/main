/** Google Calendar event shapes. Pure functions (no I/O), shared by the server code and the tests. */

export type MeetingInput = {
  title: string;
  start: string; // ISO instant
  minutes: number;
  kind: "meet" | "in_person" | "call";
  attendeeEmail: string | null;
  location: string | null;
  description: string | null;
  requestId: string; // makes the Meet link request idempotent
};

const TZ = "Asia/Kolkata";

export function endOf(start: string, minutes: number): string {
  return new Date(new Date(start).getTime() + minutes * 60_000).toISOString();
}

/** Body for Calendar API events.insert. A Meet link is requested only for Google Meet meetings. */
export function eventBody(m: MeetingInput) {
  return {
    summary: m.title.slice(0, 200),
    description: m.description?.slice(0, 4000) || undefined,
    location: m.kind === "in_person" ? m.location?.slice(0, 500) || undefined : undefined,
    start: { dateTime: m.start, timeZone: TZ },
    end: { dateTime: endOf(m.start, m.minutes), timeZone: TZ },
    attendees: m.attendeeEmail ? [{ email: m.attendeeEmail }] : undefined,
    reminders: { useDefault: true },
    ...(m.kind === "meet" ? { conferenceData: { createRequest: { requestId: m.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
  };
}

const gcal = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** "Add to Google Calendar" link, used when Google is not connected. Google Meet is added by hand in the event. */
export function templateUrl(m: Omit<MeetingInput, "requestId">): string {
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", m.title);
  u.searchParams.set("dates", `${gcal(new Date(m.start).toISOString())}/${gcal(endOf(m.start, m.minutes))}`);
  u.searchParams.set("ctz", TZ);
  if (m.description) u.searchParams.set("details", m.description);
  if (m.kind === "in_person" && m.location) u.searchParams.set("location", m.location);
  if (m.attendeeEmail) u.searchParams.set("add", m.attendeeEmail);
  return u.toString();
}
