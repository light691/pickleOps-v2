import type { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { staffId, type StaffId, type StaffRole, type VenueId } from "../../shared/types.ts";
import { hashPin, parseStaffRow } from "../db.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../domain/errors.ts";
import { unknownJson } from "../domain/validate.ts";
import { readAuth, requirePermission, requireStaff, requireVenue, type AuthedContext } from "../middleware.ts";
import { ensureSettingsStorage } from "./settings.ts";
import {
  parseStaffIdParam,
  parseStaffInvite,
  parseStaffPatch,
  toStaffEntry,
  type StaffChangeAction,
  type StaffPatch,
  type VenueStaffEntry,
} from "./settingsTypes.ts";

function errorStatus({ error }: { error: unknown }): { status: 400 | 403 | 404 | 409; body: Record<string, unknown> } {
  if (error instanceof ConflictError) return { status: 409, body: { error: error.message } };
  if (error instanceof ForbiddenError) return { status: 403, body: { error: error.message } };
  if (error instanceof NotFoundError) return { status: 404, body: { error: error.message } };
  if (error instanceof ValidationError) return { status: 400, body: { error: error.message } };
  throw error;
}

function orgIdOf({ db, id }: { db: DatabaseSync; id: StaffId }): string {
  const row = db.prepare("SELECT * FROM staff WHERE id = ?").get(id);
  if (row === undefined) throw new NotFoundError({ message: `Staff ${id} was not found.` });
  return parseStaffRow(row).orgId as string;
}

function listVenueStaff({ db, venueId: venue }: { db: DatabaseSync; venueId: VenueId }): VenueStaffEntry[] {
  const rows = db
    .prepare(
      `SELECT s.* FROM staff s
        JOIN staff_venues m ON m.staff_id = s.id
       WHERE m.venue_id = ?
       ORDER BY s.name ASC`,
    )
    .all(venue) as readonly unknown[];
  const entries = rows.map((row) => toStaffEntry({ row }));
  const seen = new Set<number>(entries.map((entry) => entry.id as number));
  const venueRow = db.prepare("SELECT org_id FROM venues WHERE id = ?").get(venue) as unknown;
  if (typeof venueRow === "object" && venueRow !== null && "org_id" in venueRow && typeof venueRow.org_id === "string") {
    const managers = db
      .prepare("SELECT * FROM staff WHERE org_id = ? AND role = 'Manager' ORDER BY name ASC")
      .all(venueRow.org_id) as readonly unknown[];
    for (const row of managers) {
      const entry = toStaffEntry({ row });
      if (!seen.has(entry.id as number)) {
        seen.add(entry.id as number);
        entries.push(entry);
      }
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function recordChange({
  db,
  venueId: venue,
  staffId: target,
  actorStaffId,
  action,
  detail,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  staffId: StaffId;
  actorStaffId: StaffId;
  action: StaffChangeAction;
  detail: string | null;
}): void {
  db.prepare(
    "INSERT INTO staff_changes (venue_id, staff_id, actor_staff_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(venue, target, actorStaffId, action, detail, new Date().toISOString());
}

function inviteStaff({
  db,
  venueId: venue,
  name,
  actorStaffId,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  name: string;
  actorStaffId: StaffId;
}): VenueStaffEntry {
  const taken = db.prepare("SELECT id FROM staff WHERE name = ?").get(name);
  if (taken !== undefined) {
    throw new ConflictError({ message: `${name} is already on the staff roster.` });
  }
  const orgId = orgIdOf({ db, id: actorStaffId });
  const credential = hashPin(randomBytes(16).toString("hex"));
  const created = db
    .prepare("INSERT INTO staff (org_id, name, role, pin_salt, pin_hash, active) VALUES (?, ?, 'Invited', ?, ?, 1)")
    .run(orgId, name, credential.salt, credential.hash);
  const id = staffId(Number(created.lastInsertRowid));
  db.prepare("INSERT INTO staff_venues (staff_id, venue_id) VALUES (?, ?)").run(id, venue);
  recordChange({
    db,
    venueId: venue,
    staffId: id,
    actorStaffId,
    action: "invited",
    detail: `${name} was invited to ${venue} as Invited.`,
  });
  const row = db.prepare("SELECT * FROM staff WHERE id = ?").get(id);
  if (row === undefined) throw new NotFoundError({ message: "The invited staff member could not be read back." });
  return toStaffEntry({ row });
}

function activeManagerCount({ db, orgId }: { db: DatabaseSync; orgId: string }): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM staff WHERE org_id = ? AND role = 'Manager' AND active = 1")
    .get(orgId) as unknown;
  if (typeof row === "object" && row !== null && "n" in row && typeof row.n === "number") return row.n;
  throw new TypeError("Expected a count row for active managers");
}

function patchStaff({
  db,
  venueId: venue,
  targetId,
  patch,
  actorStaffId,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  targetId: StaffId;
  patch: StaffPatch;
  actorStaffId: StaffId;
}): VenueStaffEntry {
  const row = db.prepare("SELECT * FROM staff WHERE id = ?").get(targetId);
  if (row === undefined) throw new NotFoundError({ message: `Staff ${targetId} was not found.` });
  const target = toStaffEntry({ row });
  const actorOrg = orgIdOf({ db, id: actorStaffId });
  if ((target.orgId as string) !== actorOrg) {
    throw new ForbiddenError({ message: `${target.name} does not belong to this organization.` });
  }
  if (targetId === actorStaffId && (patch.role !== undefined || patch.active === false)) {
    throw new ForbiddenError({ message: "You cannot change your own role or deactivate yourself." });
  }
  if (!target.active && patch.role !== undefined) {
    throw new ConflictError({ message: `${target.name} is deactivated. Reactivate them before changing roles.` });
  }

  const applyRole: StaffRole | null = patch.role ?? null;
  const applyActive: boolean | null = patch.active ?? null;

  if ((applyRole !== null && applyRole !== target.role) || applyActive === false) {
    if (target.role === "Manager" && target.active) {
      const remaining = activeManagerCount({ db, orgId: target.orgId as string });
      if (remaining <= 1) {
        throw new ConflictError({ message: `${target.name} is the last active manager and cannot be changed.` });
      }
    }
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    if (applyRole !== null && applyRole !== target.role) {
      db.prepare("UPDATE staff SET role = ? WHERE id = ?").run(applyRole, targetId);
      db.prepare("INSERT OR IGNORE INTO staff_venues (staff_id, venue_id) VALUES (?, ?)").run(targetId, venue);
      recordChange({
        db,
        venueId: venue,
        staffId: targetId,
        actorStaffId,
        action: "role-changed",
        detail: `${target.name}: ${target.role} → ${applyRole}.`,
      });
    }
    if (applyActive !== null && applyActive !== target.active) {
      db.prepare("UPDATE staff SET active = ? WHERE id = ?").run(applyActive ? 1 : 0, targetId);
      const actorRow = db.prepare("SELECT * FROM staff WHERE id = ?").get(actorStaffId);
      const actorName = actorRow === undefined ? `staff ${actorStaffId}` : parseStaffRow(actorRow).name;
      recordChange({
        db,
        venueId: venue,
        staffId: targetId,
        actorStaffId,
        action: applyActive ? "reactivated" : "deactivated",
        detail: applyActive
          ? `${target.name} was reactivated by ${actorName}.`
          : `${target.name} was deactivated by ${actorName}.`,
      });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const updated = db.prepare("SELECT * FROM staff WHERE id = ?").get(targetId);
  if (updated === undefined) throw new NotFoundError({ message: `Staff ${targetId} was not found.` });
  return toStaffEntry({ row: updated });
}

export function listStaffChanges({
  db,
  venueId: venue,
}: {
  db: DatabaseSync;
  venueId: VenueId;
}): readonly { id: number; staffId: StaffId; actorStaffId: StaffId; action: StaffChangeAction; detail: string | null }[] {
  const rows = db
    .prepare("SELECT id, staff_id, actor_staff_id, action, detail FROM staff_changes WHERE venue_id = ? ORDER BY id ASC")
    .all(venue) as readonly unknown[];
  const changes: { id: number; staffId: StaffId; actorStaffId: StaffId; action: StaffChangeAction; detail: string | null }[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) throw new TypeError("Expected staff change row object");
    const record = row as Record<string, unknown>;
    if (typeof record["id"] !== "number" || typeof record["staff_id"] !== "number" || typeof record["actor_staff_id"] !== "number") {
      throw new TypeError("Expected staff change row columns");
    }
    const action = record["action"];
    if (action !== "invited" && action !== "role-changed" && action !== "deactivated" && action !== "reactivated") {
      throw new TypeError(`Unknown staff change action: ${String(action)}`);
    }
    const detail = record["detail"];
    changes.push({
      id: record["id"],
      staffId: staffId(record["staff_id"]),
      actorStaffId: staffId(record["actor_staff_id"]),
      action,
      detail: typeof detail === "string" ? detail : null,
    });
  }
  return changes;
}

export function createStaffRoutes({ db }: { db: DatabaseSync }): Hono<AuthedContext> {
  ensureSettingsStorage({ db });
  const app = new Hono<AuthedContext>();
  const staffOnly = requireStaff({ db });
  const venueOnly = requireVenue({ db });

  app.get("/api/staff", staffOnly, venueOnly, (c) => {
    const { venueId } = readAuth({ c, db });
    try {
      return c.json(listVenueStaff({ db, venueId }));
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/api/staff", staffOnly, venueOnly, requirePermission({ permission: "manage-staff" }), async (c) => {
    let body: unknown;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      return c.json({ errors: { body: "Expected a JSON object." } }, 400);
    }
    const parsed = parseStaffInvite({ value: body });
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
    const { staffId: actorStaffId, venueId } = readAuth({ c, db });
    try {
      return c.json(inviteStaff({ db, venueId, name: parsed.value.name, actorStaffId }), 201);
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  app.patch("/api/staff/:id", staffOnly, venueOnly, requirePermission({ permission: "manage-staff" }), async (c) => {
    const idResult = parseStaffIdParam({ raw: c.req.param("id") });
    if (!idResult.ok) return c.json({ errors: idResult.errors }, 400);
    let body: unknown;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      return c.json({ errors: { body: "Expected a JSON object." } }, 400);
    }
    const parsed = parseStaffPatch({ value: body });
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
    const { staffId: actorStaffId, venueId } = readAuth({ c, db });
    try {
      return c.json(patchStaff({ db, venueId, targetId: idResult.value, patch: parsed.value, actorStaffId }));
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  return app;
}
