import type { DatabaseSync } from "node:sqlite";
import type { Context, Next } from "hono";
import { getSignedCookie } from "hono/cookie";
import {
  hasPermission,
  venueId,
  type Permission,
  type StaffId,
  type StaffMember,
  type VenueId,
} from "../shared/types.ts";
import { getCookieSecret, parseStaffRow, parseVenueRow, readCount } from "./db.ts";

export interface AppVariables {
  staff: StaffMember;
  staffId: StaffId;
  venueId: VenueId;
}

export interface AuthedContext {
  Variables: AppVariables;
}

interface GuardDeps {
  db: DatabaseSync;
}

export function requireStaff({ db }: GuardDeps) {
  return async function staffGuard(c: Context<AuthedContext>, next: Next): Promise<Response | void> {
    const secret = getCookieSecret(db);
    const raw = await getSignedCookie(c, secret, "staff_id");
    if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
      return c.json({ error: "Sign in with your staff PIN first." }, 401);
    }
    const row = db.prepare("SELECT * FROM staff WHERE id = ?").get(Number(raw));
    if (row === undefined) {
      return c.json({ error: "Sign in with your staff PIN first." }, 401);
    }
    const staff = parseStaffRow(row);
    c.set("staff", staff);
    c.set("staffId", staff.id);
    await next();
  };
}

export function requireVenue({ db }: GuardDeps) {
  return async function venueGuard(c: Context<AuthedContext>, next: Next): Promise<Response | void> {
    const raw = c.req.header("X-Venue-Id");
    if (raw === undefined || raw.trim().length === 0) {
      return c.json({ error: "Send the active venue in the X-Venue-Id header." }, 403);
    }
    let active: VenueId;
    try {
      active = venueId(raw.trim());
    } catch {
      return c.json({ error: `Unknown venue: ${raw}.` }, 403);
    }
    const venueRow = db.prepare("SELECT * FROM venues WHERE id = ?").get(active);
    if (venueRow === undefined) {
      return c.json({ error: `Unknown venue: ${raw}.` }, 403);
    }
    const venue = parseVenueRow(venueRow);
    const staff = c.get("staff");
    if (staff.role === "Manager" && staff.orgId === venue.orgId) {
      c.set("venueId", active);
      await next();
      return;
    }
    const memberships = readCount(
      db,
      "SELECT COUNT(*) AS n FROM staff_venues WHERE staff_id = ? AND venue_id = ?",
      staff.id,
      active,
    );
    if (memberships === 0) {
      return c.json({ error: `${staff.name} does not have access to this venue.` }, 403);
    }
    c.set("venueId", active);
    await next();
  };
}

export function requirePermission({ permission }: { permission: Permission }) {
  return async function permissionGuard(c: Context<AuthedContext>, next: Next): Promise<Response | void> {
    const staff = c.get("staff");
    if (!hasPermission({ role: staff.role, permission })) {
      return c.json({ error: `${staff.role} staff cannot perform this action.` }, 403);
    }
    await next();
  };
}

export function readAuth({ c, db }: { c: Context<AuthedContext>; db: DatabaseSync }): {
  staff: StaffMember;
  staffId: StaffId;
  venueId: VenueId;
} {
  return { staff: c.get("staff"), staffId: c.get("staffId"), venueId: c.get("venueId") };
}

export function venuesForStaff({ db, staff }: { db: DatabaseSync; staff: StaffMember }): VenueId[] {
  if (staff.role === "Manager") {
    const rows = db.prepare("SELECT id FROM venues WHERE org_id = ? ORDER BY name ASC").all(staff.orgId) as readonly unknown[];
    const ids: VenueId[] = [];
    for (const row of rows) {
      if (typeof row === "object" && row !== null && "id" in row && typeof row.id === "string") {
        ids.push(venueId(row.id));
      }
    }
    return ids;
  }
  const rows = db.prepare("SELECT venue_id FROM staff_venues WHERE staff_id = ?").all(staff.id) as readonly unknown[];
  const ids: VenueId[] = [];
  for (const row of rows) {
    if (typeof row === "object" && row !== null && "venue_id" in row && typeof row.venue_id === "string") {
      ids.push(venueId(row.venue_id));
    }
  }
  return ids;
}
