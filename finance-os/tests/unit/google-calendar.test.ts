import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { endOf, eventBody, templateUrl } from "@/integrations/google/event";

const base = { title: "Demo: Shine Detailing", start: "2026-11-25T05:30:00.000Z", minutes: 30, attendeeEmail: "ravi@shine.in", location: "HSR Layout", description: "Show the OS", requestId: "m-1" };

describe("Google Calendar events", () => {
  it("a Meet meeting asks Google for a Meet link and invites the client, in India time", () => {
    const b = eventBody({ ...base, kind: "meet" });
    expect(b.conferenceData).toEqual({ createRequest: { requestId: "m-1", conferenceSolutionKey: { type: "hangoutsMeet" } } });
    expect(b.attendees).toEqual([{ email: "ravi@shine.in" }]);
    expect(b.start).toEqual({ dateTime: "2026-11-25T05:30:00.000Z", timeZone: "Asia/Kolkata" });
    expect(b.end.dateTime).toBe("2026-11-25T06:00:00.000Z");
    expect(b.location).toBeUndefined();
  });
  it("an in-person visit has the shop address and no Meet link", () => {
    const b = eventBody({ ...base, kind: "in_person", attendeeEmail: null });
    expect(b).not.toHaveProperty("conferenceData");
    expect(b.location).toBe("HSR Layout");
    expect(b.attendees).toBeUndefined();
  });
  it("the Add to Google Calendar link carries the title, time and guest", () => {
    const u = new URL(templateUrl({ ...base, kind: "meet" }));
    expect(u.hostname).toBe("calendar.google.com");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("dates")).toBe("20261125T053000Z/20261125T060000Z");
    expect(u.searchParams.get("add")).toBe("ravi@shine.in");
    expect(endOf("2026-11-25T05:30:00.000Z", 90)).toBe("2026-11-25T07:00:00.000Z");
  });
});

describe("Google token storage", () => {
  it("encrypts tokens so the stored text never contains them, and rejects tampering", async () => {
    process.env.GOOGLE_CLIENT_ID = "id"; process.env.GOOGLE_CLIENT_SECRET = "secret-one";
    const { seal, open, googleConfig, authUrl } = await import("@/integrations/google/calendar");
    const s = seal("1//refresh-token");
    expect(s).not.toContain("refresh");
    expect(open(s)).toBe("1//refresh-token");
    expect(open(s.slice(0, -2) + "AA")).toBeNull();
    process.env.GOOGLE_CLIENT_SECRET = "secret-two";
    expect(open(s)).toBeNull(); // a new client secret means connecting again
    expect(googleConfig().enabled).toBe(true);
    const u = new URL(authUrl("st"));
    expect(u.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/calendar.events");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("state")).toBe("st");
  });
});
