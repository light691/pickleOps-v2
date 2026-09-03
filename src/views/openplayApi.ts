declare module "*.css";

import { ApiError, getActiveVenueId } from "../api.ts";
import {
  isAttendanceMark,
  isOpenPlayLevel,
  isRegistrationDeadline,
  isRegistrationSlot,
  openPlayRegistrationId,
  openPlaySessionId,
  paymentSubmissionId,
  type AttendanceMark,
  type OpenPlayLevel,
  type OpenPlayRegistration,
  type OpenPlaySession,
  type OpenPlaySessionDetail,
  type PaymentSubmission,
  type RegistrationDeadline,
  type RegistrationSlot,
} from "../../server/routes/openplayTypes.ts";
import {
  centavos,
  courtId,
  manilaDate,
  minuteOfDay,
  staffId,
  venueId,
  type CourtId,
  type VenueId,
} from "../../shared/types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString({ record, field }: { record: Record<string, unknown>; field: string }): string {
  const value = record[field];
  if (typeof value !== "string") throw new ApiError({ message: `Unexpected response shape at ${field}.`, status: 502 });
  return value;
}

function optionalString({ record, field }: { record: Record<string, unknown>; field: string }): string | null {
  const value = record[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new ApiError({ message: `Unexpected response shape at ${field}.`, status: 502 });
  return value;
}

function requiredNumber({ record, field }: { record: Record<string, unknown>; field: string }): number {
  const value = record[field];
  if (typeof value !== "number") throw new ApiError({ message: `Unexpected response shape at ${field}.`, status: 502 });
  return value;
}

function optionalNumber({ record, field }: { record: Record<string, unknown>; field: string }): number | null {
  const value = record[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== "number") throw new ApiError({ message: `Unexpected response shape at ${field}.`, status: 502 });
  return value;
}

function parseLevel({ value }: { value: unknown }): OpenPlayLevel {
  if (isOpenPlayLevel(value)) return value;
  throw new ApiError({ message: "Unexpected open play level in response.", status: 502 });
}

function parseDeadline({ value }: { value: unknown }): RegistrationDeadline {
  if (isRegistrationDeadline(value)) return value;
  throw new ApiError({ message: "Unexpected registration deadline in response.", status: 502 });
}

function parseSlot({ value }: { value: unknown }): RegistrationSlot {
  if (isRegistrationSlot(value)) return value;
  throw new ApiError({ message: "Unexpected registration slot in response.", status: 502 });
}

function parseCourtIds({ value }: { value: unknown }): readonly CourtId[] {
  if (!Array.isArray(value)) throw new ApiError({ message: "Unexpected court list in response.", status: 502 });
  return value.map((entry) => {
    if (typeof entry !== "number") throw new ApiError({ message: "Unexpected court list in response.", status: 502 });
    return courtId(entry);
  });
}

function parseCourtNames({ value }: { value: unknown }): readonly string[] {
  if (!Array.isArray(value)) throw new ApiError({ message: "Unexpected court names in response.", status: 502 });
  return value.map((entry) => {
    if (typeof entry !== "string") throw new ApiError({ message: "Unexpected court names in response.", status: 502 });
    return entry;
  });
}

function parseStatus({ value }: { value: unknown }): OpenPlaySession["status"] {
  if (value === "Registration open" || value === "Full") return value;
  throw new ApiError({ message: "Unexpected open play status in response.", status: 502 });
}

export function parseOpenPlaySession(value: unknown): OpenPlaySession {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected open play session in response.", status: 502 });
  return {
    id: openPlaySessionId(requiredNumber({ record: value, field: "id" })),
    venueId: venueId(requiredString({ record: value, field: "venueId" })),
    name: requiredString({ record: value, field: "name" }),
    date: manilaDate(requiredString({ record: value, field: "date" })),
    startMinute: minuteOfDay(requiredNumber({ record: value, field: "startMinute" })),
    endMinute: minuteOfDay(requiredNumber({ record: value, field: "endMinute" })),
    courtIds: parseCourtIds({ value: value["courtIds"] }),
    courtNames: parseCourtNames({ value: value["courtNames"] }),
    courtsLabel: requiredString({ record: value, field: "courtsLabel" }),
    level: parseLevel({ value: value["level"] }),
    capacity: requiredNumber({ record: value, field: "capacity" }),
    feeCentavos: centavos(requiredNumber({ record: value, field: "feeCentavos" })),
    deadline: parseDeadline({ value: value["deadline"] }),
    instructions: optionalString({ record: value, field: "instructions" }),
    status: parseStatus({ value: value["status"] }),
    rosterCount: requiredNumber({ record: value, field: "rosterCount" }),
    waitlistCount: requiredNumber({ record: value, field: "waitlistCount" }),
    createdByStaffId: staffId(requiredNumber({ record: value, field: "createdByStaffId" })),
  };
}

export function parseOpenPlayRegistration(value: unknown): OpenPlayRegistration {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected registration in response.", status: 502 });
  const position = optionalNumber({ record: value, field: "waitlistPosition" });
  const attendance = value["attendance"];
  if (attendance !== null && attendance !== undefined && !isAttendanceMark(attendance)) {
    throw new ApiError({ message: "Unexpected attendance mark in response.", status: 502 });
  }
  const paid = value["paid"];
  if (typeof paid !== "boolean") throw new ApiError({ message: "Unexpected paid flag in response.", status: 502 });
  return {
    id: openPlayRegistrationId(requiredNumber({ record: value, field: "id" })),
    venueId: venueId(requiredString({ record: value, field: "venueId" })),
    sessionId: openPlaySessionId(requiredNumber({ record: value, field: "sessionId" })),
    playerName: requiredString({ record: value, field: "playerName" }),
    mobile: optionalString({ record: value, field: "mobile" }),
    slot: parseSlot({ value: value["slot"] }),
    waitlistPosition: position,
    attendance: isAttendanceMark(attendance) ? attendance : null,
    paid,
  };
}

export function parsePaymentSubmission(value: unknown): PaymentSubmission {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected payment submission in response.", status: 502 });
  const status = value["status"];
  if (status !== "Awaiting payment" && status !== "In review" && status !== "Verified" && status !== "Rejected") {
    throw new ApiError({ message: "Unexpected payment status in response.", status: 502 });
  }
  const registrationId = optionalNumber({ record: value, field: "registrationId" });
  return {
    id: paymentSubmissionId(requiredNumber({ record: value, field: "id" })),
    venueId: venueId(requiredString({ record: value, field: "venueId" })),
    registrationId: registrationId === null ? null : openPlayRegistrationId(registrationId),
    playerName: requiredString({ record: value, field: "playerName" }),
    amountCentavos: centavos(requiredNumber({ record: value, field: "amountCentavos" })),
    method: optionalString({ record: value, field: "method" }),
    status,
    submittedByStaffId: staffId(requiredNumber({ record: value, field: "submittedByStaffId" })),
  };
}

export function parseOpenPlayDetail(value: unknown): OpenPlaySessionDetail {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected open play detail in response.", status: 502 });
  const roster = value["roster"];
  const waitlist = value["waitlist"];
  if (!Array.isArray(roster) || !Array.isArray(waitlist)) {
    throw new ApiError({ message: "Unexpected open play detail in response.", status: 502 });
  }
  return {
    session: parseOpenPlaySession(value["session"]),
    roster: roster.map((entry) => parseOpenPlayRegistration(entry)),
    waitlist: waitlist.map((entry) => parseOpenPlayRegistration(entry)),
  };
}

async function openPlayRequest({
  path,
  method,
  body,
  venueId: active,
}: {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  venueId?: VenueId;
}): Promise<unknown> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Venue-Id": ((active ?? getActiveVenueId()) as string),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const message =
      isRecord(payload) && typeof payload["error"] === "string"
        ? payload["error"]
        : isRecord(payload) && typeof payload["errors"] === "object"
          ? "Check the highlighted fields and try again."
          : `Request failed with status ${res.status}.`;
    throw new ApiError({ message, status: res.status });
  }
  return payload;
}

export interface OpenPlaySessionForm {
  readonly name: string;
  readonly date: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly courtIds: readonly number[];
  readonly level: OpenPlayLevel;
  readonly capacity: number;
  readonly feeCentavos: number;
  readonly deadline: RegistrationDeadline;
  readonly instructions: string | null;
}

export async function listOpenPlaySessions({ date }: { date?: string }): Promise<OpenPlaySession[]> {
  const path = date === undefined ? "/api/openplay/sessions" : `/api/openplay/sessions?date=${encodeURIComponent(date)}`;
  const payload = await openPlayRequest({ path, method: "GET" });
  if (!Array.isArray(payload)) throw new ApiError({ message: "Unexpected open play sessions in response.", status: 502 });
  return payload.map((entry) => parseOpenPlaySession(entry));
}

export async function getOpenPlayDetail({ id }: { id: number }): Promise<OpenPlaySessionDetail> {
  return parseOpenPlayDetail(await openPlayRequest({ path: `/api/openplay/${id}`, method: "GET" }));
}

export async function createOpenPlaySession({ input }: { input: OpenPlaySessionForm }): Promise<OpenPlaySession> {
  return parseOpenPlaySession(await openPlayRequest({ path: "/api/openplay/sessions", method: "POST", body: { ...input } }));
}

export async function updateOpenPlaySession({
  id,
  input,
}: {
  id: number;
  input: OpenPlaySessionForm;
}): Promise<OpenPlaySession> {
  return parseOpenPlaySession(
    await openPlayRequest({ path: `/api/openplay/${id}`, method: "PATCH", body: { ...input } }),
  );
}

export async function addOpenPlayRegistration({
  sessionId,
  playerName,
  mobile,
}: {
  sessionId: number;
  playerName: string;
  mobile: string | null;
}): Promise<{ registration: OpenPlayRegistration; slot: RegistrationSlot }> {
  const payload = await openPlayRequest({
    path: `/api/openplay/${sessionId}/registrations`,
    method: "POST",
    body: { playerName, mobile },
  });
  if (!isRecord(payload)) throw new ApiError({ message: "Unexpected registration in response.", status: 502 });
  return { registration: parseOpenPlayRegistration(payload["registration"]), slot: parseSlot({ value: payload["slot"] }) };
}

export async function promoteOpenPlayWaitlist({ sessionId }: { sessionId: number }): Promise<OpenPlayRegistration> {
  return parseOpenPlayRegistration(
    await openPlayRequest({ path: `/api/openplay/${sessionId}/promote`, method: "POST", body: {} }),
  );
}

export async function patchOpenPlayRegistration({
  id,
  attendance,
  paid,
}: {
  id: number;
  attendance?: AttendanceMark;
  paid?: boolean;
}): Promise<{ registration: OpenPlayRegistration; submission: PaymentSubmission | null }> {
  const body: Record<string, unknown> = {};
  if (attendance !== undefined) body["attendance"] = attendance;
  if (paid !== undefined) body["paid"] = paid;
  const payload = await openPlayRequest({ path: `/api/registrations/${id}`, method: "PATCH", body });
  if (!isRecord(payload)) throw new ApiError({ message: "Unexpected registration in response.", status: 502 });
  const submission = payload["submission"];
  return {
    registration: parseOpenPlayRegistration(payload["registration"]),
    submission: submission === null || submission === undefined ? null : parsePaymentSubmission(submission),
  };
}
