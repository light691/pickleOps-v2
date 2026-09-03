import {
  assertNever,
  type Centavos,
  type CourtId,
  type ManilaDate,
  type MinutesFromMidnight,
  type OrgId,
  type PaymentStatus,
  type StaffId,
  type VenueId,
} from "../../shared/types.ts";

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type OpenPlaySessionId = Brand<number, "OpenPlaySessionId">;
export type OpenPlayRegistrationId = Brand<number, "OpenPlayRegistrationId">;
export type PaymentSubmissionId = Brand<number, "PaymentSubmissionId">;

export function openPlaySessionId(value: number): OpenPlaySessionId {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`Open play session id must be a positive integer, got ${value}`);
  }
  return value as OpenPlaySessionId;
}

export function openPlayRegistrationId(value: number): OpenPlayRegistrationId {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`Open play registration id must be a positive integer, got ${value}`);
  }
  return value as OpenPlayRegistrationId;
}

export function paymentSubmissionId(value: number): PaymentSubmissionId {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`Payment submission id must be a positive integer, got ${value}`);
  }
  return value as PaymentSubmissionId;
}

export type OpenPlayLevel = "All levels" | "Beginner" | "Intermediate" | "Intermediate plus" | "Advanced";

export const OPENPLAY_LEVELS = [
  "All levels",
  "Beginner",
  "Intermediate",
  "Intermediate plus",
  "Advanced",
] as const satisfies readonly OpenPlayLevel[];

export function isOpenPlayLevel(value: unknown): value is OpenPlayLevel {
  return OPENPLAY_LEVELS.some((candidate) => candidate === value);
}

export type OpenPlayStatus = "Registration open" | "Full";

export const OPENPLAY_STATUSES = ["Registration open", "Full"] as const satisfies readonly OpenPlayStatus[];

export function deriveOpenPlayStatus({ rosterCount, capacity }: { rosterCount: number; capacity: number }): OpenPlayStatus {
  if (rosterCount >= capacity) return "Full";
  return "Registration open";
}

export function openPlayStatusKind({ status }: { status: OpenPlayStatus }): string {
  switch (status) {
    case "Registration open":
      return "pink";
    case "Full":
      return "gold";
    default:
      return assertNever({ value: status });
  }
}

export type RegistrationSlot = "roster" | "waitlist";

export const REGISTRATION_SLOTS = ["roster", "waitlist"] as const satisfies readonly RegistrationSlot[];

export function isRegistrationSlot(value: unknown): value is RegistrationSlot {
  return value === "roster" || value === "waitlist";
}

export type AttendanceMark = "present" | "absent";

export const ATTENDANCE_MARKS = ["present", "absent"] as const satisfies readonly AttendanceMark[];

export function isAttendanceMark(value: unknown): value is AttendanceMark {
  return value === "present" || value === "absent";
}

export type RegistrationDeadline = "At session start" | "1 hour before" | "3 hours before" | "1 day before";

export const REGISTRATION_DEADLINES = [
  "At session start",
  "1 hour before",
  "3 hours before",
  "1 day before",
] as const satisfies readonly RegistrationDeadline[];

export function isRegistrationDeadline(value: unknown): value is RegistrationDeadline {
  return REGISTRATION_DEADLINES.some((candidate) => candidate === value);
}

export function registrationDeadlineOffsetMinutes({ deadline }: { deadline: RegistrationDeadline }): number {
  switch (deadline) {
    case "At session start":
      return 0;
    case "1 hour before":
      return 60;
    case "3 hours before":
      return 180;
    case "1 day before":
      return 1440;
    default:
      return assertNever({ value: deadline });
  }
}

export interface NewOpenPlaySessionInput {
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
}

export interface OpenPlaySession {
  readonly id: OpenPlaySessionId;
  readonly venueId: VenueId;
  readonly name: string;
  readonly date: ManilaDate;
  readonly startMinute: MinutesFromMidnight;
  readonly endMinute: MinutesFromMidnight;
  readonly courtIds: readonly CourtId[];
  readonly courtNames: readonly string[];
  readonly courtsLabel: string;
  readonly level: OpenPlayLevel;
  readonly capacity: number;
  readonly feeCentavos: Centavos;
  readonly deadline: RegistrationDeadline;
  readonly instructions: string | null;
  readonly status: OpenPlayStatus;
  readonly rosterCount: number;
  readonly waitlistCount: number;
  readonly createdByStaffId: StaffId;
}

export interface OpenPlayRegistration {
  readonly id: OpenPlayRegistrationId;
  readonly venueId: VenueId;
  readonly sessionId: OpenPlaySessionId;
  readonly playerName: string;
  readonly mobile: string | null;
  readonly slot: RegistrationSlot;
  readonly waitlistPosition: number | null;
  readonly attendance: AttendanceMark | null;
  readonly paid: boolean;
}

export interface PaymentSubmission {
  readonly id: PaymentSubmissionId;
  readonly venueId: VenueId;
  readonly registrationId: OpenPlayRegistrationId | null;
  readonly playerName: string;
  readonly amountCentavos: Centavos;
  readonly method: string | null;
  readonly status: PaymentStatus;
  readonly submittedByStaffId: StaffId;
}

export interface OpenPlaySessionDetail {
  readonly session: OpenPlaySession;
  readonly roster: readonly OpenPlayRegistration[];
  readonly waitlist: readonly OpenPlayRegistration[];
}

export interface OpenPlayBlock {
  readonly sessionId: OpenPlaySessionId;
  readonly courtId: CourtId;
  readonly date: ManilaDate;
  readonly startMinute: MinutesFromMidnight;
  readonly endMinute: MinutesFromMidnight;
  readonly name: string;
}

export function formatCourtsLabel({ names }: { names: readonly string[] }): string {
  const first = names[0];
  if (first === undefined) return "No court assigned";
  if (names.length === 1) return first;
  const numbers = names.map((name) => name.replace(/^Court\s+/u, ""));
  return `Courts ${numbers.join(" & ")}`;
}
