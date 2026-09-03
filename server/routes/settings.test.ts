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
import { createCourtRoutes } from "./courts.ts";
import { createSettingsRoutes } from "./settings.ts";
import { createStaffRoutes } from "./staff.ts";

const VENUE = "venue-qc-01";
const BOGUS_VENUE = "venue-bogus";
const MANAGER = "Mia Villanueva";
const ATTENDANT = "Paolo Garcia";
const PIN = "1234";

let db: DatabaseSync;
let app: Hono<AuthedContext>;
let managerCookie = "";
let attendantCookie = "";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function seed({ database }: { database: DatabaseSync }): void {
  database.prepare("INSERT INTO organizations (id, name) VALUES (?, ?)").run("org-rallypoint", "RallyPoint");
  database
    .prepare("INSERT INTO venues (id, org_id, name, address, contact, timezone) VALUES (?, ?, ?, ?, ?, ?)")
    .run(VENUE, "org-rallypoint", "RallyPoint Quezon City", "24 Scout Borromeo St., Quezon City", "0917 842 6081", "Asia/Manila");
  const insertStaff = database.prepare(
    "INSERT INTO staff (id, org_id, name, role, pin_salt, pin_hash, active) VALUES (?, ?, ?, ?, ?, ?, 1)",
  );
  const mia = hashPin(PIN);
  insertStaff.run(1, "org-rallypoint", MANAGER, "Manager", mia.salt, mia.hash);
  const paolo = hashPin(PIN);
  insertStaff.run(2, "org-rallypoint", ATTENDANT, "Attendant", paolo.salt, paolo.hash);
  database.prepare("INSERT INTO staff_venues (staff_id, venue_id) VALUES (?, ?)").run(1, VENUE);
  database.prepare("INSERT INTO staff_venues (staff_id, venue_id) VALUES (?, ?)").run(2, VENUE);
  database
    .prepare(
      `INSERT INTO venue_settings
        (venue_id, timezone, currency, open_minute, close_minute, default_payment_status, hold_unpaid_minutes, payment_details, booking_interval_minutes, overtime_grace_minutes, overtime_minimum_minutes, payment_methods)
       VALUES (?, 'Asia/Manila', 'PHP', 480, 1320, 'Awaiting payment', 15, 'GCash · 0917 842 6081 · RallyPoint QC', 30, 10, 0, '[]')`,
    )
    .run(VENUE);
  const insertCourt = database.prepare(
    "INSERT INTO courts (id, venue_id, name, hourly_rate_centavos, bookable, sort_order) VALUES (?, ?, ?, ?, 1, ?)",
  );
  const rates = [65000, 65000, 65000, 65000, 70000, 70000];
  rates.forEach((rate, index) => {
    insertCourt.run(index + 1, VENUE, `Court ${index + 1}`, rate, index + 1);
  });
  database.prepare("INSERT INTO app_meta (key, value) VALUES ('cookie_secret', ?)").run(randomBytes(32).toString("hex"));
}

async function loginAs({ name }: { name: string }): Promise<string> {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, pin: PIN }),
  });
  assert.equal(res.status, 200);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(typeof setCookie === "string" && setCookie.length > 0);
  const first = setCookie.split(";")[0];
  assert.ok(typeof first === "string" && first.length > 0);
  return first;
}

async function call({
  path,
  method,
  cookie,
  venue,
  body,
}: {
  path: string;
  method: string;
  cookie: string;
  venue?: string;
  body?: Record<string, unknown>;
}): Promise<{ status: number; payload: unknown }> {
  const res = await app.request(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-Venue-Id": venue ?? VENUE,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  return { status: res.status, payload };
}

function field({ payload, name }: { payload: unknown; name: string }): unknown {
  assert.ok(isRecord(payload));
  return payload[name];
}

before(async () => {
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  app = new Hono<AuthedContext>();
  app.route("/", createAuthRoutes({ db }));
  app.route("/", createBookingRoutes({ db }));
  app.route("/", createSettingsRoutes({ db }));
  app.route("/", createCourtRoutes({ db }));
  app.route("/", createStaffRoutes({ db }));
  seed({ database: db });
  managerCookie = await loginAs({ name: MANAGER });
  attendantCookie = await loginAs({ name: ATTENDANT });
});

describe("settings slice", () => {
  it("reads the active venue settings", async () => {
    const { status, payload } = await call({ path: "/api/settings", method: "GET", cookie: managerCookie });
    assert.equal(status, 200);
    assert.equal(field({ payload, name: "name" }), "RallyPoint Quezon City");
    assert.equal(field({ payload, name: "bookingIntervalMinutes" }), 30);
  });

  it("rejects a bogus venue id", async () => {
    const { status } = await call({ path: "/api/settings", method: "GET", cookie: managerCookie, venue: BOGUS_VENUE });
    assert.equal(status, 403);
  });

  it("blocks attendant settings writes but allows manager writes", async () => {
    const denied = await call({
      path: "/api/settings",
      method: "PUT",
      cookie: attendantCookie,
      body: { holdUnpaidMinutes: 30 },
    });
    assert.equal(denied.status, 403);

    const allowed = await call({
      path: "/api/settings",
      method: "PUT",
      cookie: managerCookie,
      body: {
        holdUnpaidMinutes: 30,
        bookingIntervalMinutes: 60,
        overtimeGraceMinutes: 5,
        overtimeMinimumMinutes: 15,
        paymentDetails: "GCash · 0917 842 6081 · RallyPoint QC",
        paymentMethods: [{ name: "GCash", detail: "0917 842 6081 · RallyPoint QC", enabled: true }],
      },
    });
    assert.equal(allowed.status, 200);
    assert.equal(field({ payload: allowed.payload, name: "holdUnpaidMinutes" }), 30);
    assert.equal(field({ payload: allowed.payload, name: "overtimeGraceMinutes" }), 5);
  });

  it("blocks attendant court-rate writes but applies manager rate changes to new booking fees", async () => {
    const denied = await call({
      path: "/api/courts/1",
      method: "PATCH",
      cookie: attendantCookie,
      body: { hourlyRateCentavos: 80000 },
    });
    assert.equal(denied.status, 403);

    const deniedCreate = await call({
      path: "/api/courts",
      method: "POST",
      cookie: attendantCookie,
      body: { name: "Court 7", hourlyRateCentavos: 65000, bookable: true },
    });
    assert.equal(deniedCreate.status, 403);

    const updated = await call({
      path: "/api/courts/1",
      method: "PATCH",
      cookie: managerCookie,
      body: { hourlyRateCentavos: 80000 },
    });
    assert.equal(updated.status, 200);
    assert.equal(field({ payload: updated.payload, name: "hourlyRateCentavos" }), 80000);

    const booking = await call({
      path: "/api/bookings",
      method: "POST",
      cookie: attendantCookie,
      body: {
        courtId: 1,
        customerName: "Rate Check",
        mobile: null,
        source: "Walk-in",
        date: "2026-09-04",
        startMinute: 600,
        durationMinutes: 60,
        players: 2,
        notes: null,
      },
    });
    assert.equal(booking.status, 201);
    assert.equal(field({ payload: booking.payload, name: "totalCentavos" }), 80000);
  });

  it("invites staff as Invited, upgrades roles, and records the actor", async () => {
    const invited = await call({
      path: "/api/staff",
      method: "POST",
      cookie: managerCookie,
      body: { name: "Jose Ramos" },
    });
    assert.equal(invited.status, 201);
    assert.equal(field({ payload: invited.payload, name: "role" }), "Invited");
    const invitedIdValue = field({ payload: invited.payload, name: "id" });
    if (typeof invitedIdValue !== "number") throw new Error("Expected a numeric staff id.");
    const invitedId = invitedIdValue;

    const upgraded = await call({
      path: `/api/staff/${invitedId}`,
      method: "PATCH",
      cookie: managerCookie,
      body: { role: "Attendant" },
    });
    assert.equal(upgraded.status, 200);
    assert.equal(field({ payload: upgraded.payload, name: "role" }), "Attendant");

    const rows = db
      .prepare("SELECT action, actor_staff_id FROM staff_changes WHERE staff_id = ? ORDER BY id ASC")
      .all(invitedId) as readonly unknown[];
    assert.equal(rows.length, 2);
    const first = rows[0];
    assert.ok(isRecord(first));
    assert.equal(first["action"], "invited");
    assert.equal(first["actor_staff_id"], 1);
    const second = rows[1];
    assert.ok(isRecord(second));
    assert.equal(second["action"], "role-changed");
    assert.equal(second["actor_staff_id"], 1);
  });

  it("blocks attendant staff writes and lets managers deactivate", async () => {
    const deniedInvite = await call({
      path: "/api/staff",
      method: "POST",
      cookie: attendantCookie,
      body: { name: "Sneaky Invite" },
    });
    assert.equal(deniedInvite.status, 403);

    const deniedPatch = await call({
      path: "/api/staff/1",
      method: "PATCH",
      cookie: attendantCookie,
      body: { role: "Attendant" },
    });
    assert.equal(deniedPatch.status, 403);

    const deactivated = await call({
      path: "/api/staff/2",
      method: "PATCH",
      cookie: managerCookie,
      body: { active: false },
    });
    assert.equal(deactivated.status, 200);
    assert.equal(field({ payload: deactivated.payload, name: "active" }), false);

    const audit = db
      .prepare("SELECT action, actor_staff_id FROM staff_changes WHERE staff_id = 2 ORDER BY id DESC LIMIT 1")
      .get() as unknown;
    assert.ok(isRecord(audit));
    assert.equal(audit["action"], "deactivated");
    assert.equal(audit["actor_staff_id"], 1);

    const roster = await call({ path: "/api/staff", method: "GET", cookie: managerCookie });
    assert.equal(roster.status, 200);
    assert.ok(Array.isArray(roster.payload));
    const paolo = roster.payload.find((entry) => isRecord(entry) && entry["name"] === ATTENDANT);
    assert.ok(isRecord(paolo));
    assert.equal(paolo["active"], false);

    const selfHarm = await call({
      path: "/api/staff/1",
      method: "PATCH",
      cookie: managerCookie,
      body: { active: false },
    });
    assert.equal(selfHarm.status, 403);
  });
});
