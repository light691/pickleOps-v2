import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { type MinutesFromMidnight, type VenueId } from "../../shared/types.ts";
import { parseVenueRow, parseVenueSettingsRow } from "../db.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../domain/errors.ts";
import { unknownJson } from "../domain/validate.ts";
import { readAuth, requirePermission, requireStaff, requireVenue, type AuthedContext } from "../middleware.ts";
import {
  parseSettingsUpdate,
  toSettingsPayload,
  type SettingsUpdate,
  type VenueSettingsPayload,
} from "./settingsTypes.ts";

function errorStatus({ error }: { error: unknown }): { status: 400 | 403 | 404 | 409; body: Record<string, unknown> } {
  if (error instanceof ConflictError) return { status: 409, body: { error: error.message } };
  if (error instanceof ForbiddenError) return { status: 403, body: { error: error.message } };
  if (error instanceof NotFoundError) return { status: 404, body: { error: error.message } };
  if (error instanceof ValidationError) return { status: 400, body: { error: error.message } };
  throw error;
}

function columnNames({ db, table }: { db: DatabaseSync; table: string }): ReadonlySet<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as readonly unknown[];
  const names = new Set<string>();
  for (const row of rows) {
    if (typeof row === "object" && row !== null && "name" in row && typeof row.name === "string") {
      names.add(row.name);
    }
  }
  return names;
}

function addColumnIfMissing({
  db,
  table,
  column,
  definition,
}: {
  db: DatabaseSync;
  table: string;
  column: string;
  definition: string;
}): void {
  if (columnNames({ db, table }).has(column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function ensureSettingsStorage({ db }: { db: DatabaseSync }): void {
  addColumnIfMissing({
    db,
    table: "venue_settings",
    column: "booking_interval_minutes",
    definition: "INTEGER NOT NULL DEFAULT 30",
  });
  addColumnIfMissing({
    db,
    table: "venue_settings",
    column: "overtime_grace_minutes",
    definition: "INTEGER NOT NULL DEFAULT 10",
  });
  addColumnIfMissing({
    db,
    table: "venue_settings",
    column: "overtime_minimum_minutes",
    definition: "INTEGER NOT NULL DEFAULT 0",
  });
  addColumnIfMissing({ db, table: "venue_settings", column: "payment_methods", definition: "TEXT" });
  addColumnIfMissing({ db, table: "staff", column: "active", definition: "INTEGER NOT NULL DEFAULT 1" });
  db.exec(
    `CREATE TABLE IF NOT EXISTS staff_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL REFERENCES venues(id),
      staff_id INTEGER NOT NULL REFERENCES staff(id),
      actor_staff_id INTEGER NOT NULL REFERENCES staff(id),
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL
    )`,
  );
}

function readSettingsRow({ db, venueId }: { db: DatabaseSync; venueId: VenueId }): unknown {
  let row = db.prepare("SELECT * FROM venue_settings WHERE venue_id = ?").get(venueId);
  if (row === undefined) {
    db.prepare(
      `INSERT INTO venue_settings
        (venue_id, timezone, currency, open_minute, close_minute, default_payment_status, hold_unpaid_minutes, payment_details, booking_interval_minutes, overtime_grace_minutes, overtime_minimum_minutes, payment_methods)
       VALUES (?, 'Asia/Manila', 'PHP', 480, 1320, 'Awaiting payment', 15, NULL, 30, 10, 0, '[]')`,
    ).run(venueId);
    row = db.prepare("SELECT * FROM venue_settings WHERE venue_id = ?").get(venueId);
  }
  if (row === undefined) throw new NotFoundError({ message: "Venue settings were not found." });
  return row;
}

export function loadVenuePayload({ db, venueId }: { db: DatabaseSync; venueId: VenueId }): VenueSettingsPayload {
  const venueRow = db.prepare("SELECT * FROM venues WHERE id = ?").get(venueId);
  if (venueRow === undefined) throw new NotFoundError({ message: `Unknown venue: ${venueId}.` });
  const venue = parseVenueRow(venueRow);
  return toSettingsPayload({
    venue: { id: venue.id, name: venue.name, address: venue.address, contact: venue.contact, timezone: venue.timezone },
    settingsRow: readSettingsRow({ db, venueId }),
  });
}

function applySettingsUpdate({
  db,
  venueId,
  update,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  update: SettingsUpdate;
}): VenueSettingsPayload {
  const currentRow = db.prepare("SELECT * FROM venue_settings WHERE venue_id = ?").get(venueId);
  if (currentRow === undefined) throw new NotFoundError({ message: "Venue settings were not found." });
  const current = parseVenueSettingsRow(currentRow);
  const openMinute = update.openMinute ?? current.openMinute;
  const closeMinute = update.closeMinute ?? current.closeMinute;
  if ((openMinute as number) >= (closeMinute as number)) {
    throw new ValidationError({ message: "Closing time must be after opening time." });
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      update.name !== undefined ||
      update.address !== undefined ||
      update.contact !== undefined ||
      update.timezone !== undefined
    ) {
      const venueRow = db.prepare("SELECT * FROM venues WHERE id = ?").get(venueId);
      if (venueRow === undefined) throw new NotFoundError({ message: `Unknown venue: ${venueId}.` });
      const venue = parseVenueRow(venueRow);
      db.prepare("UPDATE venues SET name = ?, address = ?, contact = ?, timezone = ? WHERE id = ?").run(
        update.name ?? venue.name,
        update.address !== undefined ? update.address : venue.address,
        update.contact !== undefined ? update.contact : venue.contact,
        update.timezone ?? venue.timezone,
        venueId,
      );
    }
    const settingsBits: { column: string; value: string | number }[] = [];
    const pushMinute = ({ column, value }: { column: string; value: MinutesFromMidnight | undefined }): void => {
      if (value !== undefined) settingsBits.push({ column, value: value as number });
    };
    pushMinute({ column: "open_minute", value: update.openMinute });
    pushMinute({ column: "close_minute", value: update.closeMinute });
    if (update.bookingIntervalMinutes !== undefined) {
      settingsBits.push({ column: "booking_interval_minutes", value: update.bookingIntervalMinutes });
    }
    if (update.defaultPaymentStatus !== undefined) {
      settingsBits.push({ column: "default_payment_status", value: update.defaultPaymentStatus });
    }
    if (update.holdUnpaidMinutes !== undefined) {
      settingsBits.push({ column: "hold_unpaid_minutes", value: update.holdUnpaidMinutes });
    }
    if (update.paymentDetails !== undefined) {
      settingsBits.push({ column: "payment_details", value: update.paymentDetails ?? "" });
    }
    if (update.paymentMethods !== undefined) {
      settingsBits.push({ column: "payment_methods", value: JSON.stringify(update.paymentMethods) });
    }
    if (update.overtimeGraceMinutes !== undefined) {
      settingsBits.push({ column: "overtime_grace_minutes", value: update.overtimeGraceMinutes });
    }
    if (update.overtimeMinimumMinutes !== undefined) {
      settingsBits.push({ column: "overtime_minimum_minutes", value: update.overtimeMinimumMinutes });
    }
    if (update.timezone !== undefined) {
      settingsBits.push({ column: "timezone", value: update.timezone });
    }
    for (const bit of settingsBits) {
      if (bit.column === "payment_details" && update.paymentDetails === null) {
        db.prepare("UPDATE venue_settings SET payment_details = NULL WHERE venue_id = ?").run(venueId);
      } else if (bit.column === "timezone" || bit.column === "default_payment_status" || bit.column === "payment_methods") {
        db.prepare(`UPDATE venue_settings SET ${bit.column} = ? WHERE venue_id = ?`).run(String(bit.value), venueId);
      } else {
        db.prepare(`UPDATE venue_settings SET ${bit.column} = ? WHERE venue_id = ?`).run(Number(bit.value), venueId);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return loadVenuePayload({ db, venueId });
}

export function createSettingsRoutes({ db }: { db: DatabaseSync }): Hono<AuthedContext> {
  ensureSettingsStorage({ db });
  const app = new Hono<AuthedContext>();
  const staffOnly = requireStaff({ db });
  const venueOnly = requireVenue({ db });

  app.get("/api/settings", staffOnly, venueOnly, (c) => {
    const { venueId } = readAuth({ c, db });
    try {
      return c.json(loadVenuePayload({ db, venueId }));
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  app.put("/api/settings", staffOnly, venueOnly, requirePermission({ permission: "edit-rates" }), async (c) => {
    let body: unknown;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      return c.json({ errors: { body: "Expected a JSON object." } }, 400);
    }
    const parsed = parseSettingsUpdate({ value: body });
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
    const { venueId } = readAuth({ c, db });
    try {
      return c.json(applySettingsUpdate({ db, venueId, update: parsed.value }));
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  return app;
}
