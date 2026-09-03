import { test, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { hashPin } from "../db.ts";
import { createAuthRoutes } from "./auth.ts";
import { createOpenPlayRoutes } from "./openplay.ts";
import type { AuthedContext } from "../middleware.ts";

const VENUE = "venue-qc-01";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function reqString({ record, field }: { record: Record<string, unknown>; field: string }): string {
  const value = record[field];
  assert.equal(typeof value, "string", `Expected string at ${field}`);
  return value as string;
}

function reqNumber({ record, field }: { record: Record<string, unknown>; field: string }): number {
  const value = record[field];
  assert.equal(typeof value, "number", `Expected number at ${field}`);
  return value as number;
}

function reqRecord({ value, field }: { value: unknown; field: string }): Record<string, unknown> {
  assert.ok(isRecord(value), `Expected object at ${field}`);
  return value;
}

function reqList({ value, field }: { value: unknown; field: string }): readonly Record<string, unknown>[] {
  assert.ok(Array.isArray(value), `Expected array at ${field}`);
  return value.map((entry) => reqRecord({ value: entry, field }));
}

function buildDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../paymentsSchema.sql", import.meta.url), "utf8"));
  db.prepare("INSERT INTO organizations (id, name) VALUES (?, ?)").run("org-rallypoint", "RallyPoint");
  db.prepare("INSERT INTO venues (id, org_id, name, address, contact, timezone) VALUES (?, ?, ?, ?, ?, ?)").run(
    VENUE,
    "org-rallypoint",
    "RallyPoint Quezon City",
    "24 Scout Borromeo St., Quezon City",
    "0917 842 6081",
    "Asia/Manila",
  );
  db.prepare(
    "INSERT INTO venue_settings (venue_id, timezone, currency, open_minute, close_minute, default_payment_status, hold_unpaid_minutes, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(VENUE, "Asia/Manila", "PHP", 480, 1320, "Awaiting payment", 15, "GCash · 0917 842 6081 · RallyPoint QC");
  const insertCourt = db.prepare(
    "INSERT INTO courts (id, venue_id, name, hourly_rate_centavos, bookable, sort_order) VALUES (?, ?, ?, ?, 1, ?)",
  );
  for (let index = 1; index <= 6; index += 1) {
    insertCourt.run(index, VENUE, `Court ${index}`, 65000, index);
  }
  const insertStaff = db.prepare(
    "INSERT INTO staff (id, org_id, name, role, pin_salt, pin_hash) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const mia = hashPin("1234");
  insertStaff.run(1, "org-rallypoint", "Mia Villanueva", "Manager", mia.salt, mia.hash);
  const paolo = hashPin("1234");
  insertStaff.run(2, "org-rallypoint", "Paolo Garcia", "Attendant", paolo.salt, paolo.hash);
  const insertMembership = db.prepare("INSERT INTO staff_venues (staff_id, venue_id) VALUES (?, ?)");
  insertMembership.run(1, VENUE);
  insertMembership.run(2, VENUE);
  db.prepare("INSERT INTO app_meta (key, value) VALUES ('cookie_secret', ?)").run(randomBytes(32).toString("hex"));
  return db;
}

let app: Hono<AuthedContext>;
let cookie = "";
let sessionId = 0;
let dbRef: DatabaseSync;

async function call({
  path,
  method,
  body,
  venue,
}: {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  venue?: string;
}): Promise<{ status: number; payload: unknown }> {
  const response = await app.request(path, {
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
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

function sessionBody({ capacity }: { capacity: number }): Record<string, unknown> {
  return {
    name: "Afternoon Open Play",
    date: "2026-09-04",
    startMinute: 840,
    endMinute: 960,
    courtIds: [4],
    level: "All levels",
    capacity,
    feeCentavos: 25000,
    deadline: "At session start",
    instructions: "Players rotate every game.",
  };
}

before(async () => {
  const db = buildDb();
  dbRef = db;
  const server = new Hono<AuthedContext>();
  server.route("/", createAuthRoutes({ db }));
  server.route("/", createOpenPlayRoutes({ db }));
  app = server;
  const login = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Mia Villanueva", pin: "1234" }),
  });
  assert.equal(login.status, 200);
  const raw = login.headers.get("set-cookie") ?? "";
  const first = raw.split(";")[0];
  assert.ok(first !== undefined && first.length > 0);
  cookie = first;
});

test("filling to capacity flips status to Full and parks extras on the waitlist in order", async () => {
  const created = await call({ path: "/api/openplay/sessions", method: "POST", body: sessionBody({ capacity: 2 }) });
  assert.equal(created.status, 201);
  sessionId = reqNumber({ record: reqRecord({ value: created.payload, field: "session" }), field: "id" });

  const names = ["Bea Reyes", "Miguel Santos", "Lara Lim", "Paolo Tan"];
  const slots: string[] = [];
  for (const playerName of names) {
    const added = await call({
      path: `/api/openplay/${sessionId}/registrations`,
      method: "POST",
      body: { playerName },
    });
    assert.equal(added.status, 201);
    const addedRecord = reqRecord({ value: added.payload, field: "added" });
    const addedRegistration = reqRecord({ value: addedRecord["registration"], field: "registration" });
    slots.push(reqString({ record: addedRegistration, field: "slot" }));
  }
  assert.deepEqual(slots, ["roster", "roster", "waitlist", "waitlist"]);

  const listed = await call({ path: "/api/openplay/sessions", method: "GET" });
  assert.equal(listed.status, 200);
  const sessions = reqList({ value: listed.payload, field: "sessions" });
  const first = sessions[0];
  assert.ok(first !== undefined);
  assert.equal(reqString({ record: first, field: "status" }), "Full");
  assert.equal(reqNumber({ record: first, field: "rosterCount" }), 2);
  assert.equal(reqNumber({ record: first, field: "waitlistCount" }), 2);

  const detail = await call({ path: `/api/openplay/${sessionId}`, method: "GET" });
  assert.equal(detail.status, 200);
  const waitlist = reqList({ value: reqRecord({ value: detail.payload, field: "detail" })["waitlist"], field: "waitlist" });
  assert.equal(waitlist.length, 2);
  const firstWaitlisted = waitlist[0];
  const secondWaitlisted = waitlist[1];
  assert.ok(firstWaitlisted !== undefined && secondWaitlisted !== undefined);
  assert.equal(reqString({ record: firstWaitlisted, field: "playerName" }), "Lara Lim");
  assert.equal(reqNumber({ record: firstWaitlisted, field: "waitlistPosition" }), 1);
  assert.equal(reqString({ record: secondWaitlisted, field: "playerName" }), "Paolo Tan");
  assert.equal(reqNumber({ record: secondWaitlisted, field: "waitlistPosition" }), 2);
});

test("promote moves the first waitlisted entry to the roster", async () => {
  const resized = await call({
    path: `/api/openplay/${sessionId}`,
    method: "PATCH",
    body: sessionBody({ capacity: 3 }),
  });
  assert.equal(resized.status, 200);
  assert.equal(reqString({ record: reqRecord({ value: resized.payload, field: "session" }), field: "status" }), "Registration open");

  const promoted = await call({ path: `/api/openplay/${sessionId}/promote`, method: "POST", body: {} });
  assert.equal(promoted.status, 200);
  const registration = reqRecord({ value: promoted.payload, field: "registration" });
  assert.equal(reqString({ record: registration, field: "playerName" }), "Lara Lim");
  assert.equal(reqString({ record: registration, field: "slot" }), "roster");

  const detail = await call({ path: `/api/openplay/${sessionId}`, method: "GET" });
  const detailRecord = reqRecord({ value: detail.payload, field: "detail" });
  assert.equal(reqList({ value: detailRecord["roster"], field: "roster" }).length, 3);
  const waitlist = reqList({ value: detailRecord["waitlist"], field: "waitlist" });
  assert.equal(waitlist.length, 1);
  const remaining = waitlist[0];
  assert.ok(remaining !== undefined);
  assert.equal(reqString({ record: remaining, field: "playerName" }), "Paolo Tan");
});

test("marking paid creates a Review submission", async () => {
  const detail = await call({ path: `/api/openplay/${sessionId}`, method: "GET" });
  const roster = reqList({ value: reqRecord({ value: detail.payload, field: "detail" })["roster"], field: "roster" });
  const first = roster[0];
  assert.ok(first !== undefined);
  const registrationId = reqNumber({ record: first, field: "id" });

  const patched = await call({ path: `/api/registrations/${registrationId}`, method: "PATCH", body: { paid: true } });
  assert.equal(patched.status, 200);
  const patchedRecord = reqRecord({ value: patched.payload, field: "patched" });
  assert.equal(reqRecord({ value: patchedRecord["registration"], field: "registration" })["paid"], true);
  const submission = reqRecord({ value: patchedRecord["submission"], field: "submission" });
  assert.equal(reqString({ record: submission, field: "status" }), "In review");
  assert.equal(reqNumber({ record: submission, field: "amountCentavos" }), 25000);

  const stored = dbRef.prepare("SELECT * FROM payments WHERE kind = 'openplay' AND ref_id = ?").get(String(registrationId));
  assert.ok(isRecord(stored));
  assert.equal(stored["status"], "In review");
});

test("bogus venue is rejected with 403", async () => {
  const rejected = await call({ path: "/api/openplay/sessions", method: "GET", venue: "venue-bogus" });
  assert.equal(rejected.status, 403);
});
