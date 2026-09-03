import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { setSignedCookie } from "hono/cookie";
import { type StaffMember } from "../../shared/types.ts";
import { getCookieSecret, parseStaffRow, verifyPin } from "../db.ts";
import { requireStaff, venuesForStaff, type AuthedContext } from "../middleware.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseLoginBody(value: unknown):
  | { readonly ok: true; readonly pin: string; readonly name: string | null }
  | { readonly ok: false; readonly errors: Record<string, string> } {
  if (!isRecord(value)) return { ok: false, errors: { body: "Expected a JSON object." } };
  if (typeof value.pin !== "string" || !/^\d{4,8}$/.test(value.pin)) {
    return { ok: false, errors: { pin: "Enter your 4 to 8 digit PIN." } };
  }
  if (value.name !== undefined && (typeof value.name !== "string" || value.name.trim().length === 0)) {
    return { ok: false, errors: { name: "Enter your staff name." } };
  }
  return {
    ok: true,
    pin: value.pin,
    name: typeof value.name === "string" ? value.name.trim() : null,
  };
}

interface Credential {
  readonly id: number;
  readonly name: string;
  readonly salt: string;
  readonly hash: string;
}

function readCredentials({ db, name }: { db: DatabaseSync; name: string | null }): Credential[] {
  const rows =
    name === null
      ? ((db.prepare("SELECT id, name, pin_salt, pin_hash FROM staff").all() as readonly unknown[]))
      : ((db.prepare("SELECT id, name, pin_salt, pin_hash FROM staff WHERE name = ?").all(name) as readonly unknown[]));
  const found: Credential[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) throw new TypeError("Expected staff credentials row");
    const record = row as Record<string, unknown>;
    if (
      typeof record["id"] !== "number" ||
      typeof record["name"] !== "string" ||
      typeof record["pin_salt"] !== "string" ||
      typeof record["pin_hash"] !== "string"
    ) {
      throw new TypeError("Expected staff credentials columns");
    }
    found.push({ id: record["id"], name: record["name"], salt: record["pin_salt"], hash: record["pin_hash"] });
  }
  return found;
}

function staffPayload({ staff, venues }: { staff: StaffMember; venues: readonly string[] }): {
  staff: StaffMember;
  venues: readonly string[];
} {
  return { staff, venues };
}

export function createAuthRoutes({ db }: { db: DatabaseSync }): Hono<AuthedContext> {
  const app = new Hono<AuthedContext>();

  app.post("/api/auth/login", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ errors: { body: "Expected a JSON object." } }, 400);
    }
    const parsed = parseLoginBody(body);
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);

    const candidates = readCredentials({ db, name: parsed.name }).filter((candidate) =>
      verifyPin({ pin: parsed.pin, salt: candidate.salt, expectedHash: candidate.hash }),
    );
    if (candidates.length === 0) {
      return c.json({ error: "Invalid PIN." }, 401);
    }
    const match = candidates[0];
    if (match === undefined) return c.json({ error: "Invalid PIN." }, 401);
    if (candidates.length > 1) {
      return c.json({ error: "More than one staff member uses this PIN. Include your name." }, 400);
    }

    const staffRow = db.prepare("SELECT * FROM staff WHERE id = ?").get(match.id);
    if (staffRow === undefined) return c.json({ error: "Invalid PIN." }, 401);
    const staff = parseStaffRow(staffRow);
    if (staff.role === "Invited") {
      return c.json({ error: "Invited staff cannot sign in yet." }, 403);
    }

    await setSignedCookie(c, "staff_id", String(staff.id), getCookieSecret(db), {
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      maxAge: 12 * 60 * 60,
    });
    return c.json(staffPayload({ staff, venues: venuesForStaff({ db, staff }) }));
  });

  app.get("/api/auth/me", requireStaff({ db }), (c) => {
    const staff = c.get("staff");
    return c.json(staffPayload({ staff, venues: venuesForStaff({ db, staff }) }));
  });

  return app;
}
