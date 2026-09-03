import { before, test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { manilaNow } from "../domain/venue.ts";
import { hashPin } from "../db.ts";
import type { ManilaDate } from "../../shared/types.ts";
import { createAuthRoutes } from "./auth.ts";
import { createReportRoutes } from "./reports.ts";

const VENUE_A = "venue-qc-01";
const VENUE_B = "venue-other-01";

let db: DatabaseSync;
let app: Hono;
let paoloCookie = "";
let miaCookie = "";
let today: ManilaDate;

function daysAgo({ days }: { days: number }): ManilaDate {
  return manilaNow({ at: new Date(Date.now() - days * 86400000) }).date;
}

function bookingIdFor({ date, seq }: { date: string; seq: number }): string {
  return `RP-${date.slice(2).replaceAll("-", "")}-${String(seq).padStart(3, "0")}`;
}

function insertBooking({
  id,
  venueId,
  courtId,
  date,
  startMinute,
  durationMinutes,
  status,
  paymentStatus,
  totalCentavos,
}: {
  id: string;
  venueId: string;
  courtId: number;
  date: string;
  startMinute: number;
  durationMinutes: number;
  status: string;
  paymentStatus: string;
  totalCentavos: number;
}): void {
  db.prepare(
    `INSERT INTO bookings (id, venue_id, court_id, customer_name, mobile, source, date, start_minute, duration_minutes, players, notes, status, payment_status, total_centavos, created_by, created_at)
     VALUES (?, ?, ?, 'Seed Customer', NULL, 'Walk-in', ?, ?, ?, 4, NULL, ?, ?, ?, 1, ?)`,
  ).run(id, venueId, courtId, date, startMinute, durationMinutes, status, paymentStatus, totalCentavos, new Date().toISOString());
}

function insertSession({
  venueId,
  bookingId,
  courtId,
  scheduledEnd,
  started,
  ended,
}: {
  venueId: string;
  bookingId: string;
  courtId: number;
  scheduledEnd: number;
  started: number;
  ended: number;
}): void {
  db.prepare(
    "INSERT INTO court_sessions (venue_id, booking_id, court_id, scheduled_end_minute, started_minute, ended_minute) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(venueId, bookingId, courtId, scheduledEnd, started, ended);
}

function seed(): void {
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));

  db.prepare("INSERT INTO organizations (id, name) VALUES ('org-rallypoint', 'RallyPoint')").run();
  db.prepare("INSERT INTO venues (id, org_id, name, timezone) VALUES (?, 'org-rallypoint', ?, 'Asia/Manila')").run(
    VENUE_A,
    "RallyPoint Quezon City",
  );
  db.prepare("INSERT INTO venues (id, org_id, name, timezone) VALUES (?, 'org-rallypoint', ?, 'Asia/Manila')").run(
    VENUE_B,
    "RallyPoint Makati",
  );
  for (const venue of [VENUE_A, VENUE_B]) {
    db.prepare(
      "INSERT INTO venue_settings (venue_id, timezone, currency, open_minute, close_minute, default_payment_status, hold_unpaid_minutes, payment_details) VALUES (?, 'Asia/Manila', 'PHP', 480, 1320, 'Awaiting payment', 15, NULL)",
    ).run(venue);
  }
  db.prepare("INSERT INTO courts (id, venue_id, name, hourly_rate_centavos, bookable, sort_order) VALUES (1, ?, 'Court 1', 65000, 1, 1)").run(VENUE_A);
  db.prepare("INSERT INTO courts (id, venue_id, name, hourly_rate_centavos, bookable, sort_order) VALUES (2, ?, 'Court 2', 70000, 1, 2)").run(VENUE_A);
  db.prepare("INSERT INTO courts (id, venue_id, name, hourly_rate_centavos, bookable, sort_order) VALUES (3, ?, 'Court 1', 65000, 1, 1)").run(VENUE_B);

  const mia = hashPin("1234");
  const paolo = hashPin("1234");
  db.prepare("INSERT INTO staff (id, org_id, name, role, pin_salt, pin_hash) VALUES (1, 'org-rallypoint', 'Mia Villanueva', 'Manager', ?, ?)").run(
    mia.salt,
    mia.hash,
  );
  db.prepare("INSERT INTO staff (id, org_id, name, role, pin_salt, pin_hash) VALUES (2, 'org-rallypoint', 'Paolo Garcia', 'Attendant', ?, ?)").run(
    paolo.salt,
    paolo.hash,
  );
  db.prepare("INSERT INTO staff_venues (staff_id, venue_id) VALUES (1, ?)").run(VENUE_A);
  db.prepare("INSERT INTO staff_venues (staff_id, venue_id) VALUES (1, ?)").run(VENUE_B);
  db.prepare("INSERT INTO staff_venues (staff_id, venue_id) VALUES (2, ?)").run(VENUE_A);
  db.prepare("INSERT INTO app_meta (key, value) VALUES ('cookie_secret', 'reports-test-secret')").run();

  today = manilaNow({}).date;
  const todayText = today as string;
  const yesterday = daysAgo({ days: 1 }) as string;
  const tenDaysAgo = daysAgo({ days: 10 }) as string;

  insertBooking({ id: bookingIdFor({ date: todayText, seq: 1 }), venueId: VENUE_A, courtId: 1, date: todayText, startMinute: 600, durationMinutes: 60, status: "Completed", paymentStatus: "Verified", totalCentavos: 65000 });
  insertSession({ venueId: VENUE_A, bookingId: bookingIdFor({ date: todayText, seq: 1 }), courtId: 1, scheduledEnd: 660, started: 600, ended: 660 });
  insertBooking({ id: bookingIdFor({ date: todayText, seq: 2 }), venueId: VENUE_A, courtId: 1, date: todayText, startMinute: 720, durationMinutes: 120, status: "Completed", paymentStatus: "Verified", totalCentavos: 130000 });
  insertSession({ venueId: VENUE_A, bookingId: bookingIdFor({ date: todayText, seq: 2 }), courtId: 1, scheduledEnd: 840, started: 720, ended: 840 });
  insertBooking({ id: bookingIdFor({ date: todayText, seq: 3 }), venueId: VENUE_A, courtId: 2, date: todayText, startMinute: 600, durationMinutes: 60, status: "Cancelled", paymentStatus: "Awaiting payment", totalCentavos: 70000 });
  insertBooking({ id: bookingIdFor({ date: todayText, seq: 4 }), venueId: VENUE_A, courtId: 2, date: todayText, startMinute: 780, durationMinutes: 60, status: "No-show", paymentStatus: "Awaiting payment", totalCentavos: 70000 });
  insertBooking({ id: bookingIdFor({ date: todayText, seq: 5 }), venueId: VENUE_A, courtId: 2, date: todayText, startMinute: 900, durationMinutes: 60, status: "Reserved", paymentStatus: "In review", totalCentavos: 70000 });
  insertBooking({ id: bookingIdFor({ date: yesterday, seq: 1 }), venueId: VENUE_A, courtId: 1, date: yesterday, startMinute: 600, durationMinutes: 60, status: "Completed", paymentStatus: "Verified", totalCentavos: 65000 });
  insertSession({ venueId: VENUE_A, bookingId: bookingIdFor({ date: yesterday, seq: 1 }), courtId: 1, scheduledEnd: 660, started: 600, ended: 660 });
  insertBooking({ id: bookingIdFor({ date: tenDaysAgo, seq: 1 }), venueId: VENUE_A, courtId: 1, date: tenDaysAgo, startMinute: 600, durationMinutes: 60, status: "Completed", paymentStatus: "Verified", totalCentavos: 65000 });
  insertSession({ venueId: VENUE_A, bookingId: bookingIdFor({ date: tenDaysAgo, seq: 1 }), courtId: 1, scheduledEnd: 660, started: 600, ended: 660 });

  insertBooking({ id: "RP-000000-999", venueId: VENUE_B, courtId: 3, date: todayText, startMinute: 600, durationMinutes: 60, status: "Completed", paymentStatus: "Verified", totalCentavos: 5000000 });
  insertSession({ venueId: VENUE_B, bookingId: "RP-000000-999", courtId: 3, scheduledEnd: 660, started: 600, ended: 660 });

  app = new Hono();
  app.route("/", createAuthRoutes({ db }));
  app.route("/", createReportRoutes({ db }));
}

async function loginCookie({ name }: { name: string }): Promise<string> {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, pin: "1234" }),
  });
  assert.equal(res.status, 200);
  const header = res.headers.get("set-cookie") ?? "";
  const cookie = header.split(";")[0] ?? "";
  assert.match(cookie, /^staff_id=/);
  return cookie;
}

async function getReports({ cookie, venueId, range }: { cookie: string; venueId: string; range: string }): Promise<Response> {
  const headers: Record<string, string> = { "X-Venue-Id": venueId };
  if (cookie.length > 0) headers["Cookie"] = cookie;
  return app.request(`/api/reports?range=${range}`, { method: "GET", headers });
}

before(async () => {
  seed();
  paoloCookie = await loginCookie({ name: "Paolo Garcia" });
  miaCookie = await loginCookie({ name: "Mia Villanueva" });
});

test("today aggregates match the hand-computed seed exactly", async () => {
  const res = await getReports({ cookie: paoloCookie, venueId: VENUE_A, range: "today" });
  assert.equal(res.status, 200);
  const payload: unknown = await res.json();
  const day = today as string;
  assert.deepStrictEqual(payload, {
    range: "today",
    startDate: day,
    endDate: day,
    days: 1,
    utilization: 10.7,
    utilizationDeltaPoints: 7.1,
    bookedMinutes: 300,
    playedMinutes: 180,
    revenueCentavos: 195000,
    outstandingCentavos: 140000,
    openPlay: { participants: 0, revenueCentavos: 0, bookedMinutes: 0 },
    perCourt: [
      { courtId: 1, court: "Court 1", bookedMinutes: 180, playedMinutes: 180, availableMinutes: 840, utilization: 21.4 },
      { courtId: 2, court: "Court 2", bookedMinutes: 120, playedMinutes: 0, availableMinutes: 840, utilization: 0 },
    ],
    outcomes: { played: 2, rescheduled: 0, cancelled: 1, noShow: 1 },
    completionRate: 50,
    completionDeltaPoints: -50,
    busyBuckets: [
      { label: "8:00 AM", startMinute: 480 },
      { label: "10:00 AM", startMinute: 600 },
      { label: "12:00 PM", startMinute: 720 },
      { label: "2:00 PM", startMinute: 840 },
      { label: "4:00 PM", startMinute: 960 },
      { label: "6:00 PM", startMinute: 1080 },
      { label: "8:00 PM", startMinute: 1200 },
    ],
    busyRows: [
      { courtId: 1, court: "Court 1", minutes: [0, 60, 120, 0, 0, 0, 0], levels: [0, 2, 3, 0, 0, 0, 0] },
      { courtId: 2, court: "Court 2", minutes: [0, 0, 60, 60, 0, 0, 0], levels: [0, 0, 2, 2, 0, 0, 0] },
    ],
    paymentMix: [
      { method: "GCash", centavos: 0, share: 0 },
      { method: "Maya", centavos: 0, share: 0 },
      { method: "Cash", centavos: 0, share: 0 },
      { method: "Bank transfer", centavos: 0, share: 0 },
    ],
  });
});

test("7d and 30d windows accumulate older rows", async () => {
  const week = await getReports({ cookie: paoloCookie, venueId: VENUE_A, range: "7d" });
  assert.equal(week.status, 200);
  const weekPayload = (await week.json()) as Record<string, unknown>;
  assert.equal(weekPayload["bookedMinutes"], 360);
  assert.equal(weekPayload["playedMinutes"], 240);
  assert.equal(weekPayload["revenueCentavos"], 260000);
  assert.equal(weekPayload["outstandingCentavos"], 140000);
  assert.equal(weekPayload["utilization"], 2);
  assert.equal(weekPayload["utilizationDeltaPoints"], 1.5);
  assert.deepStrictEqual(weekPayload["outcomes"], { played: 3, rescheduled: 0, cancelled: 1, noShow: 1 });
  assert.equal(weekPayload["completionRate"], 60);
  assert.equal(weekPayload["completionDeltaPoints"], -40);
  assert.deepStrictEqual(weekPayload["perCourt"], [
    { courtId: 1, court: "Court 1", bookedMinutes: 240, playedMinutes: 240, availableMinutes: 5880, utilization: 4.1 },
    { courtId: 2, court: "Court 2", bookedMinutes: 120, playedMinutes: 0, availableMinutes: 5880, utilization: 0 },
  ]);
  assert.deepStrictEqual(weekPayload["busyRows"], [
    { courtId: 1, court: "Court 1", minutes: [0, 120, 120, 0, 0, 0, 0], levels: [0, 3, 3, 0, 0, 0, 0] },
    { courtId: 2, court: "Court 2", minutes: [0, 0, 60, 60, 0, 0, 0], levels: [0, 0, 2, 2, 0, 0, 0] },
  ]);

  const month = await getReports({ cookie: paoloCookie, venueId: VENUE_A, range: "30d" });
  assert.equal(month.status, 200);
  const monthPayload = (await month.json()) as Record<string, unknown>;
  assert.equal(monthPayload["bookedMinutes"], 420);
  assert.equal(monthPayload["playedMinutes"], 300);
  assert.equal(monthPayload["revenueCentavos"], 325000);
  assert.equal(monthPayload["outstandingCentavos"], 140000);
  assert.equal(monthPayload["utilization"], 0.6);
  assert.deepStrictEqual(monthPayload["outcomes"], { played: 4, rescheduled: 0, cancelled: 1, noShow: 1 });
  assert.equal(monthPayload["completionRate"], 66.7);
});

test("another venue's rows never leak into the numbers", async () => {
  const res = await getReports({ cookie: miaCookie, venueId: VENUE_B, range: "today" });
  assert.equal(res.status, 200);
  const payload = (await res.json()) as Record<string, unknown>;
  assert.equal(payload["bookedMinutes"], 60);
  assert.equal(payload["playedMinutes"], 60);
  assert.equal(payload["revenueCentavos"], 5000000);
  assert.equal(payload["outstandingCentavos"], 0);
  assert.deepStrictEqual(payload["outcomes"], { played: 1, rescheduled: 0, cancelled: 0, noShow: 0 });

  const attendantElsewhere = await getReports({ cookie: paoloCookie, venueId: VENUE_B, range: "today" });
  assert.equal(attendantElsewhere.status, 403);
});

test("bogus venue, missing auth, and bad range are rejected", async () => {
  const bogus = await getReports({ cookie: paoloCookie, venueId: "venue-nope", range: "today" });
  assert.equal(bogus.status, 403);

  const anonymous = await getReports({ cookie: "", venueId: VENUE_A, range: "today" });
  assert.equal(anonymous.status, 401);

  const badRange = await getReports({ cookie: paoloCookie, venueId: VENUE_A, range: "year" });
  assert.equal(badRange.status, 400);
});
