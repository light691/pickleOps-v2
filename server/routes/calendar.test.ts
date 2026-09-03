import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { hashPin } from "../db.ts";
import type { AuthedContext } from "../middleware.ts";
import { createAuthRoutes } from "./auth.ts";
import { createBookingRoutes } from "./bookings.ts";
import { createCalendarRoutes } from "./calendar.ts";

interface BlockShape {
  readonly court: string;
  readonly courtId: number;
  readonly bookingId: string;
  readonly customer: string;
  readonly state: string;
  readonly paymentHint: string;
  readonly startMinute: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function fieldString({ record, field }: { record: Record<string, unknown>; field: string }): string {
  const value = record[field];
  if (typeof value !== "string") throw new Error(`Expected string at ${field}`);
  return value;
}

function fieldNumber({ record, field }: { record: Record<string, unknown>; field: string }): number {
  const value = record[field];
  if (typeof value !== "number") throw new Error(`Expected number at ${field}`);
  return value;
}

function readBlocks(payload: unknown): BlockShape[] {
  assert.ok(isRecord(payload), "Expected a calendar object");
  assert.ok(Array.isArray(payload["blocks"]), "Expected blocks array");
  return payload["blocks"].map((entry) => {
    assert.ok(isRecord(entry), "Expected block object");
    return {
      court: fieldString({ record: entry, field: "court" }),
      courtId: fieldNumber({ record: entry, field: "courtId" }),
      bookingId: fieldString({ record: entry, field: "bookingId" }),
      customer: fieldString({ record: entry, field: "customer" }),
      state: fieldString({ record: entry, field: "state" }),
      paymentHint: fieldString({ record: entry, field: "paymentHint" }),
      startMinute: fieldNumber({ record: entry, field: "startMinute" }),
    };
  });
}

let app: Hono<AuthedContext>;
let cookie = "";

async function authed({ path, method, venue, body }: { path: string; method: string; venue: string; body?: unknown }): Promise<Response> {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie, "X-Venue-Id": venue },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

before(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const secret = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO organizations (id, name) VALUES (?, ?)").run("org-rallypoint", "RallyPoint");
  db.prepare("INSERT INTO venues (id, org_id, name, address, contact, timezone) VALUES (?, ?, ?, ?, ?, ?)").run(
    "venue-qc-01",
    "org-rallypoint",
    "RallyPoint Quezon City",
    "24 Scout Borromeo St., Quezon City",
    "0917 842 6081",
    "Asia/Manila",
  );
  db.prepare(
    "INSERT INTO venue_settings (venue_id, timezone, currency, open_minute, close_minute, default_payment_status, hold_unpaid_minutes, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run("venue-qc-01", "Asia/Manila", "PHP", 480, 1320, "Awaiting payment", 15, "GCash · 0917 842 6081");
  const insertCourt = db.prepare(
    "INSERT INTO courts (id, venue_id, name, hourly_rate_centavos, bookable, sort_order) VALUES (?, ?, ?, ?, 1, ?)",
  );
  const rates = [65000, 65000, 65000, 65000, 70000, 70000];
  rates.forEach((rate, index) => {
    insertCourt.run(index + 1, "venue-qc-01", `Court ${index + 1}`, rate, index + 1);
  });
  const insertStaff = db.prepare("INSERT INTO staff (id, org_id, name, role, pin_salt, pin_hash) VALUES (?, ?, ?, ?, ?, ?)");
  const mia = hashPin("1234");
  insertStaff.run(1, "org-rallypoint", "Mia Villanueva", "Manager", mia.salt, mia.hash);
  const paolo = hashPin("1234");
  insertStaff.run(2, "org-rallypoint", "Paolo Garcia", "Attendant", paolo.salt, paolo.hash);
  const insertMembership = db.prepare("INSERT INTO staff_venues (staff_id, venue_id) VALUES (?, ?)");
  insertMembership.run(1, "venue-qc-01");
  insertMembership.run(2, "venue-qc-01");
  db.prepare("INSERT INTO app_meta (key, value) VALUES ('cookie_secret', ?)").run(secret);
  const insertBooking = db.prepare(
    `INSERT INTO bookings (id, venue_id, court_id, customer_name, mobile, source, date, start_minute, duration_minutes, players, notes, status, payment_status, total_centavos, created_by, created_at)
     VALUES (?, 'venue-qc-01', ?, ?, NULL, 'Walk-in', '2026-09-04', ?, ?, 4, NULL, ?, 'Awaiting payment', 65000, 2, ?)`,
  );
  const now = new Date().toISOString();
  insertBooking.run("RP-260904-001", 1, "Miguel Santos", 600, 60, "Reserved", now);
  insertBooking.run("RP-260904-002", 2, "Bea Reyes", 660, 60, "In play", now);
  insertBooking.run("RP-260904-003", 3, "Team Dink Manila", 600, 120, "Reserved", now);
  insertBooking.run("RP-260904-004", 1, "Carlo Mendoza", 840, 60, "Reserved", now);
  insertBooking.run("RP-260904-005", 4, "Ana Cruz", 780, 60, "Arrived", now);

  const harness = new Hono<AuthedContext>();
  harness.route("/", createAuthRoutes({ db }));
  harness.route("/", createBookingRoutes({ db }));
  harness.route("/", createCalendarRoutes({ db }));
  app = harness;

  const login = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Paolo Garcia", pin: "1234" }),
  });
  assert.equal(login.status, 200);
  cookie = login.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0] ?? "")
    .filter((entry) => entry.length > 0)
    .join("; ");
  assert.ok(cookie.length > 0, "Expected a session cookie");
});

describe("calendar slice", () => {
  it("renders seeded day blocks per court", async () => {
    const res = await authed({ path: "/api/calendar?date=2026-09-04", method: "GET", venue: "venue-qc-01" });
    assert.equal(res.status, 200);
    const blocks = readBlocks(await res.json());
    assert.equal(blocks.length, 5);
    const byCustomer = new Map(blocks.map((block) => [block.customer, block]));
    assert.equal(byCustomer.get("Miguel Santos")?.court, "Court 1");
    assert.equal(byCustomer.get("Miguel Santos")?.state, "confirmed");
    assert.equal(byCustomer.get("Bea Reyes")?.court, "Court 2");
    assert.equal(byCustomer.get("Bea Reyes")?.state, "playing");
    assert.equal(byCustomer.get("Team Dink Manila")?.court, "Court 3");
    assert.equal(byCustomer.get("Ana Cruz")?.state, "held");
    for (const block of blocks) {
      assert.equal(block.paymentHint, "Unpaid");
    }
  });

  it("rejects bogus venues with 403", async () => {
    const res = await authed({ path: "/api/calendar?date=2026-09-04", method: "GET", venue: "venue-nope" });
    assert.equal(res.status, 403);
  });

  it("returns 409 with clash detail on overlapping reschedule", async () => {
    const res = await authed({
      path: "/api/bookings/RP-260904-004",
      method: "PATCH",
      venue: "venue-qc-01",
      body: { startMinute: 630 },
    });
    assert.equal(res.status, 409);
    const payload: unknown = await res.json();
    assert.ok(isRecord(payload), "Expected a 409 object");
    assert.equal(typeof payload["error"], "string");
    assert.ok(isRecord(payload["clash"]), "Expected clash detail");
    assert.equal(payload["clash"]["customer"], "Miguel Santos");
  });

  it("transfers a booking to another court", async () => {
    const res = await authed({
      path: "/api/bookings/RP-260904-004",
      method: "PATCH",
      venue: "venue-qc-01",
      body: { courtId: 5 },
    });
    assert.equal(res.status, 200);
    const payload: unknown = await res.json();
    assert.ok(isRecord(payload), "Expected a booking object");
    assert.equal(payload["courtId"], 5);
  });

  it("cancelling frees the slot for a new booking", async () => {
    const cancel = await authed({
      path: "/api/bookings/RP-260904-001",
      method: "PATCH",
      venue: "venue-qc-01",
      body: { status: "Cancelled" },
    });
    assert.equal(cancel.status, 200);
    const cancelled: unknown = await cancel.json();
    assert.ok(isRecord(cancelled), "Expected a booking object");
    assert.equal(cancelled["status"], "Cancelled");

    const day = await authed({ path: "/api/calendar?date=2026-09-04", method: "GET", venue: "venue-qc-01" });
    const blocks = readBlocks(await day.json());
    assert.ok(!blocks.some((block) => block.customer === "Miguel Santos"), "Cancelled block leaves the calendar");

    const rebook = await authed({
      path: "/api/bookings",
      method: "POST",
      venue: "venue-qc-01",
      body: {
        courtId: 1,
        customerName: "Walk-in Guest",
        mobile: null,
        source: "Walk-in",
        date: "2026-09-04",
        startMinute: 600,
        durationMinutes: 60,
        players: 2,
        notes: null,
      },
    });
    assert.equal(rebook.status, 201);
  });
});
