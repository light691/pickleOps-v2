import type { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import {
  assertNever,
  centavos,
  courtId,
  manilaDate,
  minuteOfDay,
  staffId,
  type Centavos,
  type CourtId,
  type ManilaDate,
  type MinutesFromMidnight,
  type StaffId,
  type VenueId,
} from "../../shared/types.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../domain/errors.ts";
import { parsePositiveIntParam, unknownJson, type FieldErrors, type ParseResult } from "../domain/validate.ts";
import { parseCourtRow } from "../db.ts";
import { readAuth, requirePermission, requireStaff, requireVenue, type AuthedContext } from "../middleware.ts";
import {
  deriveOpenPlayStatus,
  formatCourtsLabel,
  isAttendanceMark,
  isOpenPlayLevel,
  isRegistrationDeadline,
  isRegistrationSlot,
  openPlayRegistrationId,
  openPlaySessionId,
  paymentSubmissionId,
  type AttendanceMark,
  type NewOpenPlaySessionInput,
  type OpenPlayBlock,
  type OpenPlayLevel,
  type OpenPlayRegistration,
  type OpenPlayRegistrationId,
  type OpenPlaySession,
  type OpenPlaySessionDetail,
  type OpenPlaySessionId,
  type PaymentSubmission,
  type RegistrationDeadline,
  type RegistrationSlot,
} from "./openplayTypes.ts";

export function setupOpenPlaySchema({ db }: { db: DatabaseSync }): void {
  db.exec(readFileSync(new URL("../openplaySchema.sql", import.meta.url), "utf8"));
}

function errorStatus({ error }: { error: unknown }): { status: 400 | 403 | 404 | 409; body: Record<string, unknown> } {
  if (error instanceof ConflictError) return { status: 409, body: { error: error.message } };
  if (error instanceof ForbiddenError) return { status: 403, body: { error: error.message } };
  if (error instanceof NotFoundError) return { status: 404, body: { error: error.message } };
  if (error instanceof ValidationError) return { status: 400, body: { error: error.message } };
  throw error;
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

function parseCourtIdList(value: unknown): CourtId[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError({ message: "Pick at least one court." });
  }
  const ids: CourtId[] = [];
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isSafeInteger(entry) || entry <= 0) {
      throw new ValidationError({ message: "Courts must be positive integer ids." });
    }
    const id = courtId(entry);
    if (!ids.some((existing) => (existing as number) === (id as number))) ids.push(id);
  }
  return ids;
}

export function parseSessionInput(value: unknown): ParseResult<NewOpenPlaySessionInput> {
  if (!isRecord(value)) return { ok: false, errors: { body: "Expected a JSON object." } };
  const errors: FieldErrors = {};

  let name: string | null = null;
  if (typeof value["name"] !== "string" || value["name"].trim().length === 0 || value["name"].length > 120) {
    errors["name"] = "Enter the session name.";
  } else {
    name = value["name"].trim();
  }

  let date: ManilaDate | null = null;
  if (typeof value["date"] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value["date"])) {
    errors["date"] = "Enter the session date.";
  } else {
    date = manilaDate(value["date"]);
  }

  let startMinute: MinutesFromMidnight | null = null;
  if (
    typeof value["startMinute"] !== "number" ||
    !Number.isSafeInteger(value["startMinute"]) ||
    value["startMinute"] < 0 ||
    value["startMinute"] >= 1440
  ) {
    errors["startMinute"] = "Enter a start time between 00:00 and 23:59.";
  } else {
    startMinute = minuteOfDay(value["startMinute"]);
  }

  let endMinute: MinutesFromMidnight | null = null;
  const rawEnd = value["endMinute"];
  const rawDuration = value["durationMinutes"];
  if (typeof rawEnd === "number" && Number.isSafeInteger(rawEnd) && rawEnd > 0 && rawEnd < 1440) {
    endMinute = minuteOfDay(rawEnd);
  } else if (
    typeof rawDuration === "number" &&
    Number.isSafeInteger(rawDuration) &&
    rawDuration >= 30 &&
    rawDuration <= 480 &&
    rawDuration % 30 === 0 &&
    startMinute !== null
  ) {
    endMinute = minuteOfDay((startMinute as number) + rawDuration);
  } else {
    errors["endMinute"] = "Enter an end time or a duration of 30 to 480 minutes.";
  }
  if (startMinute !== null && endMinute !== null && (endMinute as number) <= (startMinute as number)) {
    errors["endMinute"] = "The session must end after it starts.";
  }

  let courtIds: CourtId[] | null = null;
  try {
    courtIds = parseCourtIdList(value["courtIds"] ?? value["courts"]);
  } catch (error) {
    errors["courtIds"] = error instanceof ValidationError ? error.message : "Pick at least one court.";
  }

  let level: OpenPlayLevel | null = null;
  if (!isOpenPlayLevel(value["level"])) {
    errors["level"] = "Pick a player level.";
  } else {
    level = value["level"];
  }

  let capacity: number | null = null;
  if (typeof value["capacity"] !== "number" || !Number.isSafeInteger(value["capacity"]) || value["capacity"] < 2 || value["capacity"] > 64) {
    errors["capacity"] = "Capacity must be between 2 and 64 players.";
  } else {
    capacity = value["capacity"];
  }

  let feeCentavos: Centavos | null = null;
  if (typeof value["feeCentavos"] !== "number" || !Number.isSafeInteger(value["feeCentavos"]) || value["feeCentavos"] < 0) {
    errors["feeCentavos"] = "Fee must be a non-negative integer in centavos.";
  } else {
    feeCentavos = centavos(value["feeCentavos"]);
  }

  let deadline: RegistrationDeadline = "At session start";
  const rawDeadline = value["deadline"];
  if (rawDeadline !== undefined && rawDeadline !== null) {
    if (!isRegistrationDeadline(rawDeadline)) {
      errors["deadline"] = "Pick when registration closes.";
    } else {
      deadline = rawDeadline;
    }
  }

  const rawInstructions = value["instructions"];
  if (rawInstructions !== null && rawInstructions !== undefined && typeof rawInstructions !== "string") {
    errors["instructions"] = "Instructions must be text.";
  }
  if (typeof rawInstructions === "string" && rawInstructions.length > 2000) {
    errors["instructions"] = "Instructions must be shorter than 2000 characters.";
  }

  if (
    Object.keys(errors).length > 0 ||
    name === null ||
    date === null ||
    startMinute === null ||
    endMinute === null ||
    courtIds === null ||
    level === null ||
    capacity === null ||
    feeCentavos === null
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      name,
      date,
      startMinute,
      endMinute,
      courtIds,
      level,
      capacity,
      feeCentavos,
      deadline,
      instructions: typeof rawInstructions === "string" && rawInstructions.trim().length > 0 ? rawInstructions.trim() : null,
    },
  };
}

export function parseRegistrationInput(value: unknown): ParseResult<{ playerName: string; mobile: string | null }> {
  if (!isRecord(value)) return { ok: false, errors: { body: "Expected a JSON object." } };
  const errors: FieldErrors = {};
  let playerName: string | null = null;
  if (typeof value["playerName"] !== "string" || value["playerName"].trim().length === 0 || value["playerName"].length > 120) {
    errors["playerName"] = "Enter the player name.";
  } else {
    playerName = value["playerName"].trim();
  }
  const rawMobile = value["mobile"];
  if (rawMobile !== null && rawMobile !== undefined && typeof rawMobile !== "string") {
    errors["mobile"] = "Mobile number must be text.";
  }
  if (Object.keys(errors).length > 0 || playerName === null) return { ok: false, errors };
  return {
    ok: true,
    value: {
      playerName,
      mobile: typeof rawMobile === "string" && rawMobile.trim().length > 0 ? rawMobile.trim() : null,
    },
  };
}

export function parseRegistrationPatch(value: unknown): ParseResult<{ attendance?: AttendanceMark; paid?: boolean }> {
  if (!isRecord(value)) return { ok: false, errors: { body: "Expected a JSON object." } };
  const errors: FieldErrors = {};
  let attendance: AttendanceMark | undefined;
  let paid: boolean | undefined;
  if ("attendance" in value) {
    if (value["attendance"] !== null && !isAttendanceMark(value["attendance"])) {
      errors["attendance"] = "Attendance must be present or absent.";
    } else if (isAttendanceMark(value["attendance"])) {
      attendance = value["attendance"];
    }
  }
  if ("paid" in value) {
    if (typeof value["paid"] !== "boolean") {
      errors["paid"] = "Paid must be true or false.";
    } else {
      paid = value["paid"];
    }
  }
  if (attendance === undefined && paid === undefined && Object.keys(errors).length === 0) {
    errors["body"] = "Send attendance or paid to update.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const patch: { attendance?: AttendanceMark; paid?: boolean } = {};
  if (attendance !== undefined) patch.attendance = attendance;
  if (paid !== undefined) patch.paid = paid;
  return { ok: true, value: patch };
}

interface SessionBase {
  readonly id: OpenPlaySessionId;
  readonly venueId: VenueId;
  readonly name: string;
  readonly date: ManilaDate;
  readonly startMinute: MinutesFromMidnight;
  readonly endMinute: MinutesFromMidnight;
  readonly courtIds: readonly CourtId[];
  readonly level: OpenPlayLevel;
  readonly capacity: number;
  readonly feeCentavos: Centavos;
  readonly deadline: RegistrationDeadline;
  readonly instructions: string | null;
  readonly createdByStaffId: StaffId;
}

function parseSessionBase(row: unknown): SessionBase {
  if (!isRecord(row)) throw new TypeError("Expected openplay_sessions row object");
  const level = str(row, "level");
  if (!isOpenPlayLevel(level)) throw new TypeError(`Unknown open play level in database: ${level}`);
  const deadline = str(row, "registration_deadline");
  if (!isRegistrationDeadline(deadline)) throw new TypeError(`Unknown registration deadline in database: ${deadline}`);
  let courtIds: CourtId[];
  try {
    const parsed: unknown = JSON.parse(str(row, "court_ids"));
    if (!Array.isArray(parsed)) throw new TypeError("Expected court id array");
    courtIds = parsed.map((entry) => {
      if (typeof entry !== "number") throw new TypeError("Expected numeric court id");
      return courtId(entry);
    });
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw new TypeError("Expected court id JSON array");
  }
  return {
    id: openPlaySessionId(num(row, "id")),
    venueId: str(row, "venue_id") as VenueId,
    name: str(row, "name"),
    date: manilaDate(str(row, "date")),
    startMinute: minuteOfDay(num(row, "start_minute")),
    endMinute: minuteOfDay(num(row, "end_minute")),
    courtIds,
    level,
    capacity: num(row, "capacity"),
    feeCentavos: centavos(num(row, "fee_centavos")),
    deadline,
    instructions: strOrNull(row, "instructions"),
    createdByStaffId: staffId(num(row, "created_by")),
  };
}

function parseRegistrationRow(row: unknown): OpenPlayRegistration {
  if (!isRecord(row)) throw new TypeError("Expected openplay_registrations row object");
  const slot = str(row, "slot");
  if (!isRegistrationSlot(slot)) throw new TypeError(`Unknown registration slot in database: ${slot}`);
  const attendanceValue = strOrNull(row, "attendance");
  if (attendanceValue !== null && !isAttendanceMark(attendanceValue)) {
    throw new TypeError(`Unknown attendance mark in database: ${attendanceValue}`);
  }
  const position = numOrNull(row, "waitlist_position");
  return {
    id: openPlayRegistrationId(num(row, "id")),
    venueId: str(row, "venue_id") as VenueId,
    sessionId: openPlaySessionId(num(row, "session_id")),
    playerName: str(row, "player_name"),
    mobile: strOrNull(row, "mobile"),
    slot,
    waitlistPosition: position,
    attendance: attendanceValue,
    paid: num(row, "paid") === 1,
  };
}

function parseSubmissionRow(row: unknown): PaymentSubmission {
  if (!isRecord(row)) throw new TypeError("Expected payments row object");
  const status = str(row, "status");
  if (status !== "Awaiting payment" && status !== "In review" && status !== "Verified" && status !== "Rejected") {
    throw new TypeError(`Unknown payment status in database: ${status}`);
  }
  const refValue = str(row, "ref_id");
  const registrationValue = Number(refValue);
  return {
    id: paymentSubmissionId(num(row, "id")),
    venueId: str(row, "venue_id") as VenueId,
    registrationId: Number.isInteger(registrationValue) ? openPlayRegistrationId(registrationValue) : null,
    playerName: str(row, "payer_name"),
    amountCentavos: centavos(num(row, "submitted_centavos")),
    method: strOrNull(row, "method"),
    status,
    submittedByStaffId: staffId(num(row, "submitted_by")),
  };
}

function rosterCount({ db, sessionId }: { db: DatabaseSync; sessionId: OpenPlaySessionId }): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM openplay_registrations WHERE session_id = ? AND slot = 'roster'")
    .get(sessionId as number);
  if (!isRecord(row) || typeof row["n"] !== "number") throw new TypeError("Expected a count row");
  return row["n"];
}

function waitlistCount({ db, sessionId }: { db: DatabaseSync; sessionId: OpenPlaySessionId }): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM openplay_registrations WHERE session_id = ? AND slot = 'waitlist'")
    .get(sessionId as number);
  if (!isRecord(row) || typeof row["n"] !== "number") throw new TypeError("Expected a count row");
  return row["n"];
}

function courtNamesFor({
  db,
  venueId: active,
  courtIds,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  courtIds: readonly CourtId[];
}): string[] {
  return courtIds.map((courtIdValue) => {
    const row = db.prepare("SELECT * FROM courts WHERE id = ?").get(courtIdValue as number);
    if (row === undefined) throw new NotFoundError({ message: `Court ${courtIdValue as number} was not found.` });
    const court = parseCourtRow(row);
    if (court.venueId !== active) {
      throw new ForbiddenError({ message: `Court ${court.name} does not belong to this venue.` });
    }
    return court.name;
  });
}

function toSessionDto({
  db,
  venueId: active,
  base,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  base: SessionBase;
}): OpenPlaySession {
  const names = courtNamesFor({ db, venueId: active, courtIds: base.courtIds });
  const roster = rosterCount({ db, sessionId: base.id });
  return {
    id: base.id,
    venueId: base.venueId,
    name: base.name,
    date: base.date,
    startMinute: base.startMinute,
    endMinute: base.endMinute,
    courtIds: base.courtIds,
    courtNames: names,
    courtsLabel: formatCourtsLabel({ names }),
    level: base.level,
    capacity: base.capacity,
    feeCentavos: base.feeCentavos,
    deadline: base.deadline,
    instructions: base.instructions,
    status: deriveOpenPlayStatus({ rosterCount: roster, capacity: base.capacity }),
    rosterCount: roster,
    waitlistCount: waitlistCount({ db, sessionId: base.id }),
    createdByStaffId: base.createdByStaffId,
  };
}

function loadSessionBase({
  db,
  venueId: active,
  sessionId,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  sessionId: OpenPlaySessionId;
}): SessionBase {
  const row = db.prepare("SELECT * FROM openplay_sessions WHERE id = ?").get(sessionId as number);
  if (row === undefined) throw new NotFoundError({ message: `Open play session ${sessionId as number} was not found.` });
  const base = parseSessionBase(row);
  if (base.venueId !== active) {
    throw new ForbiddenError({ message: `Open play session ${sessionId as number} does not belong to this venue.` });
  }
  return base;
}

function loadRegistration({
  db,
  venueId: active,
  registrationId,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  registrationId: OpenPlayRegistrationId;
}): OpenPlayRegistration {
  const row = db.prepare("SELECT * FROM openplay_registrations WHERE id = ?").get(registrationId as number);
  if (row === undefined) throw new NotFoundError({ message: `Registration ${registrationId as number} was not found.` });
  const registration = parseRegistrationRow(row);
  if (registration.venueId !== active) {
    throw new ForbiddenError({ message: `Registration ${registrationId as number} does not belong to this venue.` });
  }
  return registration;
}

function transact<T>({ db, work }: { db: DatabaseSync; work: () => T }): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createOpenPlaySession({
  db,
  venueId: active,
  input,
  staffId: actor,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  input: NewOpenPlaySessionInput;
  staffId: StaffId;
}): OpenPlaySession {
  courtNamesFor({ db, venueId: active, courtIds: input.courtIds });
  if ((input.endMinute as number) <= (input.startMinute as number)) {
    throw new ValidationError({ message: "The session must end after it starts." });
  }
  const created = transact({
    db,
    work: () => {
      const result = db
        .prepare(
          `INSERT INTO openplay_sessions (venue_id, name, date, start_minute, end_minute, court_ids, level, capacity, fee_centavos, registration_deadline, instructions, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          active as string,
          input.name,
          input.date as string,
          input.startMinute as number,
          input.endMinute as number,
          JSON.stringify(input.courtIds.map((id) => id as number)),
          input.level,
          input.capacity,
          input.feeCentavos as number,
          input.deadline,
          input.instructions,
          actor as number,
          new Date().toISOString(),
        );
      return openPlaySessionId(Number(result.lastInsertRowid));
    },
  });
  return toSessionDto({ db, venueId: active, base: loadSessionBase({ db, venueId: active, sessionId: created }) });
}

export function updateOpenPlaySession({
  db,
  venueId: active,
  sessionId,
  input,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  sessionId: OpenPlaySessionId;
  input: NewOpenPlaySessionInput;
}): OpenPlaySession {
  loadSessionBase({ db, venueId: active, sessionId });
  courtNamesFor({ db, venueId: active, courtIds: input.courtIds });
  if ((input.endMinute as number) <= (input.startMinute as number)) {
    throw new ValidationError({ message: "The session must end after it starts." });
  }
  transact({
    db,
    work: () => {
      db.prepare(
        `UPDATE openplay_sessions
         SET name = ?, date = ?, start_minute = ?, end_minute = ?, court_ids = ?, level = ?, capacity = ?,
             fee_centavos = ?, registration_deadline = ?, instructions = ?
         WHERE id = ?`,
      ).run(
        input.name,
        input.date as string,
        input.startMinute as number,
        input.endMinute as number,
        JSON.stringify(input.courtIds.map((id) => id as number)),
        input.level,
        input.capacity,
        input.feeCentavos as number,
        input.deadline,
        input.instructions,
        sessionId as number,
      );
    },
  });
  return toSessionDto({ db, venueId: active, base: loadSessionBase({ db, venueId: active, sessionId }) });
}

export function listOpenPlaySessions({
  db,
  venueId: active,
  date,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  date: ManilaDate | null;
}): OpenPlaySession[] {
  const rows =
    date === null
      ? ((db
          .prepare("SELECT * FROM openplay_sessions WHERE venue_id = ? ORDER BY date ASC, start_minute ASC")
          .all(active as string) as readonly unknown[]))
      : ((db
          .prepare("SELECT * FROM openplay_sessions WHERE venue_id = ? AND date = ? ORDER BY start_minute ASC")
          .all(active as string, date as string) as readonly unknown[]));
  return rows.map((row) => {
    const base = parseSessionBase(row);
    return toSessionDto({ db, venueId: active, base });
  });
}

export function getOpenPlayDetail({
  db,
  venueId: active,
  sessionId,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  sessionId: OpenPlaySessionId;
}): OpenPlaySessionDetail {
  const base = loadSessionBase({ db, venueId: active, sessionId });
  const rosterRows = db
    .prepare("SELECT * FROM openplay_registrations WHERE session_id = ? AND slot = 'roster' ORDER BY id ASC")
    .all(sessionId as number) as readonly unknown[];
  const waitlistRows = db
    .prepare(
      "SELECT * FROM openplay_registrations WHERE session_id = ? AND slot = 'waitlist' ORDER BY waitlist_position ASC, id ASC",
    )
    .all(sessionId as number) as readonly unknown[];
  return {
    session: toSessionDto({ db, venueId: active, base }),
    roster: rosterRows.map((row) => parseRegistrationRow(row)),
    waitlist: waitlistRows.map((row) => parseRegistrationRow(row)),
  };
}

export function createRegistration({
  db,
  venueId: active,
  sessionId,
  playerName,
  mobile,
  staffId: actor,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  sessionId: OpenPlaySessionId;
  playerName: string;
  mobile: string | null;
  staffId: StaffId;
}): OpenPlayRegistration {
  const base = loadSessionBase({ db, venueId: active, sessionId });
  if (base.venueId !== active) {
    throw new ForbiddenError({ message: `Open play session ${sessionId as number} does not belong to this venue.` });
  }
  const created = transact({
    db,
    work: () => {
      const roster = rosterCount({ db, sessionId: base.id });
      const slot: RegistrationSlot = roster < base.capacity ? "roster" : "waitlist";
      let position: number | null = null;
      if (slot === "waitlist") {
        const row = db
          .prepare("SELECT MAX(waitlist_position) AS n FROM openplay_registrations WHERE session_id = ? AND slot = 'waitlist'")
          .get(base.id as number);
        const max = isRecord(row) && typeof row["n"] === "number" ? row["n"] : 0;
        position = max + 1;
      }
      const result = db
        .prepare(
          `INSERT INTO openplay_registrations (venue_id, session_id, player_name, mobile, slot, waitlist_position, attendance, paid, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`,
        )
        .run(active as string, base.id as number, playerName, mobile, slot, position, actor as number, new Date().toISOString());
      return openPlayRegistrationId(Number(result.lastInsertRowid));
    },
  });
  return loadRegistration({ db, venueId: active, registrationId: created });
}

export function promoteRegistration({
  db,
  venueId: active,
  sessionId,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  sessionId: OpenPlaySessionId;
}): OpenPlayRegistration {
  const base = loadSessionBase({ db, venueId: active, sessionId });
  const promoted = transact({
    db,
    work: () => {
      const row = db
        .prepare(
          "SELECT * FROM openplay_registrations WHERE session_id = ? AND slot = 'waitlist' ORDER BY waitlist_position ASC, id ASC LIMIT 1",
        )
        .get(base.id as number);
      if (row === undefined) {
        throw new ConflictError({ message: `${base.name} has no waitlisted players to promote.` });
      }
      const next = parseRegistrationRow(row);
      if (next.venueId !== active) {
        throw new ForbiddenError({ message: `Registration ${next.id as number} does not belong to this venue.` });
      }
      if (rosterCount({ db, sessionId: base.id }) >= base.capacity) {
        throw new ConflictError({ message: `${base.name} is already full. Raise capacity before promoting.` });
      }
      db.prepare("UPDATE openplay_registrations SET slot = 'roster', waitlist_position = NULL WHERE id = ?").run(
        next.id as number,
      );
      return next.id;
    },
  });
  return loadRegistration({ db, venueId: active, registrationId: promoted });
}

export function patchRegistration({
  db,
  venueId: active,
  registrationId,
  patch,
  staffId: actor,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  registrationId: OpenPlayRegistrationId;
  patch: { attendance?: AttendanceMark; paid?: boolean };
  staffId: StaffId;
}): { registration: OpenPlayRegistration; submission: PaymentSubmission | null } {
  const current = loadRegistration({ db, venueId: active, registrationId });
  const created = transact({
    db,
    work: () => {
      if (patch.attendance !== undefined) {
        db.prepare("UPDATE openplay_registrations SET attendance = ? WHERE id = ?").run(
          patch.attendance,
          current.id as number,
        );
      }
      let submissionId: number | null = null;
      if (patch.paid !== undefined) {
        db.prepare("UPDATE openplay_registrations SET paid = ? WHERE id = ?").run(
          patch.paid ? 1 : 0,
          current.id as number,
        );
        if (patch.paid && !current.paid) {
          const base = loadSessionBase({ db, venueId: active, sessionId: current.sessionId });
          const result = db
            .prepare(
              `INSERT INTO payments (venue_id, kind, ref_id, expected_centavos, submitted_centavos, method, txn_reference, payer_name, receipt, status, submitted_by, created_at)
               VALUES (?, 'openplay', ?, ?, ?, NULL, NULL, ?, NULL, 'In review', ?, ?)`,
            )
            .run(
              active as string,
              String(current.id as number),
              base.feeCentavos as number,
              base.feeCentavos as number,
              current.playerName,
              actor as number,
              new Date().toISOString(),
            );
          submissionId = Number(result.lastInsertRowid);
        }
      }
      return submissionId;
    },
  });
  const submission =
    created === null
      ? null
      : parseSubmissionRow(db.prepare("SELECT * FROM payments WHERE id = ?").get(created));
  return { registration: loadRegistration({ db, venueId: active, registrationId }), submission };
}

function tableExists({ db, table }: { db: DatabaseSync; table: string }): boolean {
  const row = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  return typeof row === "object" && row !== null && "n" in row && row.n === 1;
}

export function listOpenPlayBlocks({
  db,
  venueId: active,
  date,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  date: ManilaDate;
}): OpenPlayBlock[] {
  if (!tableExists({ db, table: "openplay_sessions" })) return [];
  const rows = db
    .prepare("SELECT * FROM openplay_sessions WHERE venue_id = ? AND date = ? ORDER BY start_minute ASC")
    .all(active as string, date as string) as readonly unknown[];
  const blocks: OpenPlayBlock[] = [];
  for (const row of rows) {
    const base = parseSessionBase(row);
    for (const courtIdValue of base.courtIds) {
      blocks.push({
        sessionId: base.id,
        courtId: courtIdValue,
        date: base.date,
        startMinute: base.startMinute,
        endMinute: base.endMinute,
        name: base.name,
      });
    }
  }
  return blocks;
}

function parseSessionIdParam({ raw }: { raw: string | undefined }): ParseResult<OpenPlaySessionId> {
  const parsed = parsePositiveIntParam(raw, "id");
  if (!parsed.ok) return parsed;
  return { ok: true, value: openPlaySessionId(parsed.value) };
}

function parseRegistrationIdParam({ raw }: { raw: string | undefined }): ParseResult<OpenPlayRegistrationId> {
  const parsed = parsePositiveIntParam(raw, "id");
  if (!parsed.ok) return parsed;
  return { ok: true, value: openPlayRegistrationId(parsed.value) };
}

function describeSlot({ slot }: { slot: RegistrationSlot }): string {
  switch (slot) {
    case "roster":
      return "roster";
    case "waitlist":
      return "waitlist";
    default:
      return assertNever({ value: slot });
  }
}

export function createOpenPlayRoutes({ db }: { db: DatabaseSync }): Hono<AuthedContext> {
  setupOpenPlaySchema({ db });
  const app = new Hono<AuthedContext>();
  const staffOnly = requireStaff({ db });
  const venueOnly = requireVenue({ db });
  const sessionsOnly = requirePermission({ permission: "manage-sessions" });

  app.get("/api/openplay/sessions", staffOnly, venueOnly, (c) => {
    const { venueId: active } = readAuth({ c, db });
    const rawDate = c.req.query("date");
    let date: ManilaDate | null = null;
    if (rawDate !== undefined && rawDate.trim().length > 0) {
      try {
        date = manilaDate(rawDate.trim());
      } catch {
        return c.json({ errors: { date: "Enter the session date." } }, 400);
      }
    }
    try {
      return c.json(listOpenPlaySessions({ db, venueId: active, date }));
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/api/openplay/sessions", staffOnly, venueOnly, sessionsOnly, async (c) => {
    let body: unknown;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      return c.json({ errors: { body: "Expected a JSON object." } }, 400);
    }
    const parsed = parseSessionInput(body);
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
    const { venueId: active, staffId: actor } = readAuth({ c, db });
    try {
      return c.json(createOpenPlaySession({ db, venueId: active, input: parsed.value, staffId: actor }), 201);
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  app.get("/api/openplay/:id", staffOnly, venueOnly, (c) => {
    const idResult = parseSessionIdParam({ raw: c.req.param("id") });
    if (!idResult.ok) return c.json({ errors: idResult.errors }, 400);
    const { venueId: active } = readAuth({ c, db });
    try {
      return c.json(getOpenPlayDetail({ db, venueId: active, sessionId: idResult.value }));
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  app.patch("/api/openplay/:id", staffOnly, venueOnly, sessionsOnly, async (c) => {
    const idResult = parseSessionIdParam({ raw: c.req.param("id") });
    if (!idResult.ok) return c.json({ errors: idResult.errors }, 400);
    let body: unknown;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      return c.json({ errors: { body: "Expected a JSON object." } }, 400);
    }
    const parsed = parseSessionInput(body);
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
    const { venueId: active } = readAuth({ c, db });
    try {
      return c.json(updateOpenPlaySession({ db, venueId: active, sessionId: idResult.value, input: parsed.value }));
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/api/openplay/:id/registrations", staffOnly, venueOnly, sessionsOnly, async (c) => {
    const idResult = parseSessionIdParam({ raw: c.req.param("id") });
    if (!idResult.ok) return c.json({ errors: idResult.errors }, 400);
    let body: unknown;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      return c.json({ errors: { body: "Expected a JSON object." } }, 400);
    }
    const parsed = parseRegistrationInput(body);
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
    const { venueId: active, staffId: actor } = readAuth({ c, db });
    try {
      const registration = createRegistration({
        db,
        venueId: active,
        sessionId: idResult.value,
        playerName: parsed.value.playerName,
        mobile: parsed.value.mobile,
        staffId: actor,
      });
      return c.json({ registration, slot: describeSlot({ slot: registration.slot }) }, 201);
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/api/openplay/:id/promote", staffOnly, venueOnly, sessionsOnly, (c) => {
    const idResult = parseSessionIdParam({ raw: c.req.param("id") });
    if (!idResult.ok) return c.json({ errors: idResult.errors }, 400);
    const { venueId: active } = readAuth({ c, db });
    try {
      return c.json(promoteRegistration({ db, venueId: active, sessionId: idResult.value }));
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  app.patch("/api/registrations/:id", staffOnly, venueOnly, sessionsOnly, async (c) => {
    const idResult = parseRegistrationIdParam({ raw: c.req.param("id") });
    if (!idResult.ok) return c.json({ errors: idResult.errors }, 400);
    let body: unknown;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      return c.json({ errors: { body: "Expected a JSON object." } }, 400);
    }
    const parsed = parseRegistrationPatch(body);
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
    const { venueId: active, staffId: actor } = readAuth({ c, db });
    try {
      return c.json(
        patchRegistration({ db, venueId: active, registrationId: idResult.value, patch: parsed.value, staffId: actor }),
      );
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  return app;
}
