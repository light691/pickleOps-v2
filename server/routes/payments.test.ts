import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { hashPin } from "../db.ts";
import type { AuthedContext } from "../middleware.ts";
import { createAuthRoutes } from "./auth.ts";
import { createPaymentRoutes } from "./payments.ts";

const VENUE = "venue-qc-01";
const MANAGER = "Mia Villanueva";
const ATTENDANT = "Paolo Garcia";
const PIN = "1234";

let db: DatabaseSync;
let app: Hono<AuthedContext>;

function seedValue({ value }: { value: unknown }): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new TypeError("Expected a JSON object response.");
  const record = value as Record<string, unknown>;
  return record;
}

async function loginCookie({ name }: { name: string }): Promise<string> {
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

function authedHeaders({ cookie, venue }: { cookie: string; venue: string }): Record<string, string> {
  return { "Content-Type": "application/json", Cookie: cookie, "X-Venue-Id": venue };
}

async function readBody({ res }: { res: Response }): Promise<Record<string, unknown>> {
  return seedValue({ value: await res.json() });
}

before(() => {
  db = new DatabaseSync(":memory:");
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
  const mia = hashPin(PIN);
  const paolo = hashPin(PIN);
  const insertStaff = db.prepare("INSERT INTO staff (id, org_id, name, role, pin_salt, pin_hash) VALUES (?, ?, ?, ?, ?, ?)");
  insertStaff.run(1, "org-rallypoint", MANAGER, "Manager", mia.salt, mia.hash);
  insertStaff.run(2, "org-rallypoint", ATTENDANT, "Attendant", paolo.salt, paolo.hash);
  const insertMembership = db.prepare("INSERT INTO staff_venues (staff_id, venue_id) VALUES (?, ?)");
  insertMembership.run(1, VENUE);
  insertMembership.run(2, VENUE);
  db.prepare("INSERT INTO app_meta (key, value) VALUES ('cookie_secret', ?)").run(randomBytes(32).toString("hex"));

  app = new Hono<AuthedContext>();
  app.route("/", createAuthRoutes({ db }));
  app.route("/", createPaymentRoutes({ db }));
});

function submissionBody(): Record<string, unknown> {
  return {
    kind: "booking",
    refId: "RP-260904-001",
    expectedCentavos: 65000,
    submittedCentavos: 65000,
    method: "GCash",
    txnReference: "8472 0051 9032",
    payerName: "ANA M CRUZ",
    receipt: "GCash payment screenshot",
  };
}

describe("payments slice", () => {
  it("lands a manual submission in the Review queue", async () => {
    const cookie = await loginCookie({ name: ATTENDANT });
    const created = await app.request("/api/payments", {
      method: "POST",
      headers: authedHeaders({ cookie, venue: VENUE }),
      body: JSON.stringify(submissionBody()),
    });
    assert.equal(created.status, 201);
    const payload = await readBody({ res: created });
    assert.equal(payload["status"], "In review");
    assert.equal(payload["expectedCentavos"], 65000);
    assert.equal(payload["submittedCentavos"], 65000);

    const queue = await app.request("/api/payments", {
      headers: authedHeaders({ cookie, venue: VENUE }),
    });
    assert.equal(queue.status, 200);
    const listed: unknown = await queue.json();
    assert.ok(Array.isArray(listed) && listed.length === 1);
  });

  it("rejects a bogus venue with 403", async () => {
    const cookie = await loginCookie({ name: ATTENDANT });
    const res = await app.request("/api/payments", {
      headers: authedHeaders({ cookie, venue: "venue-nowhere" }),
    });
    assert.equal(res.status, 403);
  });

  it("returns 403 when an attendant verifies", async () => {
    const cookie = await loginCookie({ name: ATTENDANT });
    const res = await app.request("/api/payments/1", {
      method: "PATCH",
      headers: authedHeaders({ cookie, venue: VENUE }),
      body: JSON.stringify({ verdict: "Verified", staffNote: "Looks good." }),
    });
    assert.equal(res.status, 403);
  });

  it("records the verifier and timestamp on manager verify", async () => {
    const cookie = await loginCookie({ name: MANAGER });
    const res = await app.request("/api/payments/1", {
      method: "PATCH",
      headers: authedHeaders({ cookie, venue: VENUE }),
      body: JSON.stringify({ verdict: "Verified", staffNote: "GCash reference matches." }),
    });
    assert.equal(res.status, 200);
    const payload = await readBody({ res });
    assert.equal(payload["status"], "Verified");
    assert.equal(payload["verifiedBy"], 1);
    const verifiedAt = payload["verifiedAt"];
    assert.ok(typeof verifiedAt === "string" && verifiedAt.length > 0);
    assert.equal(payload["staffNote"], "GCash reference matches.");
  });

  it("refuses any transition once Verified", async () => {
    const cookie = await loginCookie({ name: MANAGER });
    for (const verdict of ["Rejected", "Verified"]) {
      const res = await app.request("/api/payments/1", {
        method: "PATCH",
        headers: authedHeaders({ cookie, venue: VENUE }),
        body: JSON.stringify({ verdict, staffNote: "Second look." }),
      });
      assert.equal(res.status, 409);
    }
  });
});
