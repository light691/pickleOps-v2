import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  bookingId,
  centavos,
  courtId,
  courtSessionId,
  manilaDate,
  minuteOfDay,
  orgId,
  staffId,
  venueId,
  type Booking,
  type BookingSource,
  type BookingStatus,
  type Court,
  type CourtSession,
  type Organization,
  type PaymentStatus,
  type StaffMember,
  type StaffRole,
  type Venue,
  type VenueId,
  type VenueSettings,
} from "../shared/types.ts";

export const SEED_ORG_ID = "org-rallypoint";
export const SEED_VENUE_ID = "venue-qc-01";
export const SEED_MANAGER_NAME = "Mia Villanueva";
export const SEED_ATTENDANT_NAME = "Paolo Garcia";
export const SEED_PIN = "1234";

let database: DatabaseSync | null = null;

export function openDb(): DatabaseSync {
  if (database) return database;
  const db = new DatabaseSync("pickleops.db");
  dropLegacySingleTenantTables(db);
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  ensureStaffActiveColumn({ db });
  db.exec(readFileSync(new URL("./paymentsSchema.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("./openplaySchema.sql", import.meta.url), "utf8"));
  seed(db);
  database = db;
  return db;
}

function legacyColumnNames(db: DatabaseSync, table: string): ReadonlySet<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as readonly unknown[];
  const names = new Set<string>();
  for (const row of rows) {
    if (typeof row === "object" && row !== null && "name" in row && typeof row.name === "string") {
      names.add(row.name);
    }
  }
  return names;
}

function dropLegacySingleTenantTables(db: DatabaseSync): void {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as readonly unknown[];
  const present = new Set<string>();
  for (const row of tables) {
    if (typeof row === "object" && row !== null && "name" in row && typeof row.name === "string") {
      present.add(row.name);
    }
  }
  if (!present.has("bookings") && !present.has("courts")) return;
  const bookingColumns = present.has("bookings") ? legacyColumnNames(db, "bookings") : new Set<string>();
  if (bookingColumns.has("venue_id")) return;
  db.exec(
    "DROP TABLE IF EXISTS court_sessions; DROP TABLE IF EXISTS bookings; DROP TABLE IF EXISTS courts; DROP TABLE IF EXISTS staff; DROP TABLE IF EXISTS venue_settings;",
  );
}

function seed(db: DatabaseSync): void {
  if (readCount(db, "SELECT COUNT(*) AS n FROM organizations") === 0) {
    db.prepare("INSERT INTO organizations (id, name) VALUES (?, ?)").run(SEED_ORG_ID, "RallyPoint");
  }

  if (readCount(db, "SELECT COUNT(*) AS n FROM venues") === 0) {
    db.prepare(
      "INSERT INTO venues (id, org_id, name, address, contact, timezone) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      SEED_VENUE_ID,
      SEED_ORG_ID,
      "RallyPoint Quezon City",
      "24 Scout Borromeo St., Quezon City",
      "0917 842 6081",
      "Asia/Manila",
    );
  }

  if (readCount(db, "SELECT COUNT(*) AS n FROM venue_settings") === 0) {
    db.prepare(
      "INSERT INTO venue_settings (venue_id, timezone, currency, open_minute, close_minute, default_payment_status, hold_unpaid_minutes, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      SEED_VENUE_ID,
      "Asia/Manila",
      "PHP",
      480,
      1320,
      "Awaiting payment",
      15,
      "GCash · 0917 842 6081 · RallyPoint QC",
    );
  }

  if (readCount(db, "SELECT COUNT(*) AS n FROM courts") === 0) {
    const insertCourt = db.prepare(
      "INSERT INTO courts (id, venue_id, name, hourly_rate_centavos, bookable, sort_order) VALUES (?, ?, ?, ?, 1, ?)",
    );
    const rates = [65000, 65000, 65000, 65000, 70000, 70000];
    rates.forEach((rate, index) => {
      insertCourt.run(index + 1, SEED_VENUE_ID, `Court ${index + 1}`, rate, index + 1);
    });
  }

  if (readCount(db, "SELECT COUNT(*) AS n FROM staff") === 0) {
    const insertStaff = db.prepare(
      "INSERT INTO staff (id, org_id, name, role, pin_salt, pin_hash) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const mia = hashPin(SEED_PIN);
    insertStaff.run(1, SEED_ORG_ID, SEED_MANAGER_NAME, "Manager", mia.salt, mia.hash);
    const paolo = hashPin(SEED_PIN);
    insertStaff.run(2, SEED_ORG_ID, SEED_ATTENDANT_NAME, "Attendant", paolo.salt, paolo.hash);
  }

  if (readCount(db, "SELECT COUNT(*) AS n FROM staff_venues") === 0) {
    const insertMembership = db.prepare("INSERT INTO staff_venues (staff_id, venue_id) VALUES (?, ?)");
    insertMembership.run(1, SEED_VENUE_ID);
    insertMembership.run(2, SEED_VENUE_ID);
  }

  if (readCount(db, "SELECT COUNT(*) AS n FROM app_meta WHERE key = 'cookie_secret'") === 0) {
    db.prepare("INSERT INTO app_meta (key, value) VALUES ('cookie_secret', ?)").run(
      randomBytes(32).toString("hex"),
    );
  }
}

function staffColumnNames({ db }: { db: DatabaseSync }): ReadonlySet<string> {
  const rows = db.prepare("PRAGMA table_info(staff)").all() as readonly unknown[];
  const names = new Set<string>();
  for (const row of rows) {
    if (typeof row === "object" && row !== null && "name" in row && typeof row.name === "string") {
      names.add(row.name);
    }
  }
  return names;
}

function ensureStaffActiveColumn({ db }: { db: DatabaseSync }): void {
  if (staffColumnNames({ db }).has("active")) return;
  db.exec("ALTER TABLE staff ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
}

export function staffActive({ db, staffId }: { db: DatabaseSync; staffId: number }): boolean {
  if (!staffColumnNames({ db }).has("active")) return true;
  const row = db.prepare("SELECT active FROM staff WHERE id = ?").get(staffId);
  if (typeof row !== "object" || row === null || !("active" in row)) return true;
  return row.active !== 0;
}

export function getCookieSecret(db: DatabaseSync): string {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = 'cookie_secret'").get();
  if (typeof row === "object" && row !== null && "value" in row && typeof row.value === "string") {
    return row.value;
  }
  throw new TypeError("Missing cookie_secret in app_meta");
}

export function hashPin(pin: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(pin, salt, 32).toString("hex") };
}

export function verifyPin({ pin, salt, expectedHash }: { pin: string; salt: string; expectedHash: string }): boolean {
  const candidate = scryptSync(pin, salt, 32);
  const expected = Buffer.from(expectedHash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function readCount(db: DatabaseSync, sql: string, ...params: readonly (string | number | null)[]): number {
  const row = db.prepare(sql).get(...params);
  if (!isRecord(row) || typeof row.n !== "number") {
    throw new TypeError(`Expected a count row from: ${sql}`);
  }
  return row.n;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string") throw new TypeError(`Expected string in column ${field}`);
  return value;
}

function strOrNull(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "string") throw new TypeError(`Expected string or null in column ${field}`);
  return value;
}

function num(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (typeof value !== "number") throw new TypeError(`Expected number in column ${field}`);
  return value;
}

function numOrNull(row: Record<string, unknown>, field: string): number | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "number") throw new TypeError(`Expected number or null in column ${field}`);
  return value;
}

function isBookingSource(value: string): value is BookingSource {
  return value === "Messenger" || value === "Viber" || value === "Phone" || value === "Walk-in";
}

function isBookingStatus(value: string): value is BookingStatus {
  return (
    value === "Reserved" ||
    value === "Arrived" ||
    value === "In play" ||
    value === "Completed" ||
    value === "Cancelled" ||
    value === "No-show"
  );
}

function isPaymentStatus(value: string): value is PaymentStatus {
  return value === "Awaiting payment" || value === "In review" || value === "Verified" || value === "Rejected";
}

function isStaffRole(value: string): value is StaffRole {
  return value === "Attendant" || value === "Manager" || value === "Invited";
}

export function parseOrganizationRow(row: unknown): Organization {
  if (!isRecord(row)) throw new TypeError("Expected organizations row object");
  return { id: orgId(str(row, "id")), name: str(row, "name") };
}

export function parseVenueRow(row: unknown): Venue {
  if (!isRecord(row)) throw new TypeError("Expected venues row object");
  return {
    id: venueId(str(row, "id")),
    orgId: orgId(str(row, "org_id")),
    name: str(row, "name"),
    address: strOrNull(row, "address"),
    contact: strOrNull(row, "contact"),
    timezone: str(row, "timezone"),
  };
}

export function parseVenueSettingsRow(row: unknown): VenueSettings {
  if (!isRecord(row)) throw new TypeError("Expected venue_settings row object");
  const defaultPaymentStatus = str(row, "default_payment_status");
  if (!isPaymentStatus(defaultPaymentStatus)) {
    throw new TypeError(`Unknown payment status in database: ${defaultPaymentStatus}`);
  }
  return {
    venueId: venueId(str(row, "venue_id")),
    timezone: str(row, "timezone"),
    currency: str(row, "currency"),
    openMinute: minuteOfDay(num(row, "open_minute")),
    closeMinute: minuteOfDay(num(row, "close_minute")),
    defaultPaymentStatus,
    holdUnpaidMinutes: num(row, "hold_unpaid_minutes"),
    paymentDetails: strOrNull(row, "payment_details"),
  };
}

export function parseCourtRow(row: unknown): Court {
  if (!isRecord(row)) throw new TypeError("Expected court row object");
  return {
    id: courtId(num(row, "id")),
    venueId: venueId(str(row, "venue_id")),
    name: str(row, "name"),
    hourlyRate: centavos(num(row, "hourly_rate_centavos")),
    bookable: num(row, "bookable") === 1,
    sortOrder: num(row, "sort_order"),
  };
}

export function parseStaffRow(row: unknown): StaffMember {
  if (!isRecord(row)) throw new TypeError("Expected staff row object");
  const role = str(row, "role");
  if (!isStaffRole(role)) throw new TypeError(`Unknown staff role in database: ${role}`);
  return { id: staffId(num(row, "id")), orgId: orgId(str(row, "org_id")), name: str(row, "name"), role };
}

export function parseStaffCredentialsRow(row: unknown): {
  id: number;
  name: string;
  role: StaffRole;
  pinSalt: string;
  pinHash: string;
} {
  if (!isRecord(row)) throw new TypeError("Expected staff credentials row object");
  const role = str(row, "role");
  if (!isStaffRole(role)) throw new TypeError(`Unknown staff role in database: ${role}`);
  return { id: num(row, "id"), name: str(row, "name"), role, pinSalt: str(row, "pin_salt"), pinHash: str(row, "pin_hash") };
}

export function parseBookingRow(row: unknown): Booking {
  if (!isRecord(row)) throw new TypeError("Expected booking row object");
  const source = str(row, "source");
  if (!isBookingSource(source)) throw new TypeError(`Unknown booking source in database: ${source}`);
  const status = str(row, "status");
  if (!isBookingStatus(status)) throw new TypeError(`Unknown booking status in database: ${status}`);
  const paymentStatus = str(row, "payment_status");
  if (!isPaymentStatus(paymentStatus)) throw new TypeError(`Unknown payment status in database: ${paymentStatus}`);
  const totalCentavos = numOrNull(row, "total_centavos");
  return {
    id: bookingId(str(row, "id")),
    venueId: venueId(str(row, "venue_id")),
    courtId: courtId(num(row, "court_id")),
    customerName: str(row, "customer_name"),
    mobile: strOrNull(row, "mobile"),
    source,
    date: manilaDate(str(row, "date")),
    startMinute: minuteOfDay(num(row, "start_minute")),
    durationMinutes: num(row, "duration_minutes"),
    players: num(row, "players"),
    notes: strOrNull(row, "notes"),
    status,
    paymentStatus,
    totalCentavos: totalCentavos === null ? null : centavos(totalCentavos),
    createdByStaffId: staffId(num(row, "created_by")),
  };
}

export function parseSessionRow(row: unknown): CourtSession {
  if (!isRecord(row)) throw new TypeError("Expected court session row object");
  const endedMinute = numOrNull(row, "ended_minute");
  return {
    id: courtSessionId(num(row, "id")),
    venueId: venueId(str(row, "venue_id")),
    bookingId: bookingId(str(row, "booking_id")),
    courtId: courtId(num(row, "court_id")),
    scheduledEndMinute: minuteOfDay(num(row, "scheduled_end_minute")),
    startedMinute: minuteOfDay(num(row, "started_minute")),
    endedMinute: endedMinute === null ? null : minuteOfDay(endedMinute),
  };
}

export function venueIdsForStaff({ db, staffId: id }: { db: DatabaseSync; staffId: number }): VenueId[] {
  const rows = db.prepare("SELECT venue_id FROM staff_venues WHERE staff_id = ?").all(id) as readonly unknown[];
  const ids: VenueId[] = [];
  for (const row of rows) {
    if (typeof row === "object" && row !== null && "venue_id" in row && typeof row.venue_id === "string") {
      ids.push(venueId(row.venue_id));
    }
  }
  return ids;
}

export function staffOrgId({ db, staffId: id }: { db: DatabaseSync; staffId: number }): string {
  const row = db.prepare("SELECT org_id FROM staff WHERE id = ?").get(id);
  if (typeof row !== "object" || row === null || !("org_id" in row) || typeof row.org_id !== "string") {
    throw new TypeError("Expected staff org row");
  }
  return row.org_id;
}

export function venueExists({ db, venueId: id }: { db: DatabaseSync; venueId: VenueId }): boolean {
  return readCount(db, "SELECT COUNT(*) AS n FROM venues WHERE id = ?", id) > 0;
}
