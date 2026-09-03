declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Centavos = Brand<number, "Centavos">;
export type MinutesFromMidnight = Brand<number, "MinutesFromMidnight">;
export type ManilaDate = Brand<string, "ManilaDate">;
export type BookingId = Brand<string, "BookingId">;
export type OrgId = Brand<string, "OrgId">;
export type VenueId = Brand<string, "VenueId">;
export type StaffId = Brand<number, "StaffId">;
export type CourtId = Brand<number, "CourtId">;
export type CourtSessionId = Brand<number, "CourtSessionId">;

export function centavos(value: number): Centavos {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Centavos must be a non-negative safe integer, got ${value}`);
  }
  return value as Centavos;
}

export function minuteOfDay(value: number): MinutesFromMidnight {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 1440) {
    throw new RangeError(`Minutes from midnight must be 0..1439, got ${value}`);
  }
  return value as MinutesFromMidnight;
}

export function manilaDate(value: string): ManilaDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`Manila date must be YYYY-MM-DD, got ${value}`);
  }
  return value as ManilaDate;
}

export function bookingId(value: string): BookingId {
  if (!/^RP-\d{6}-\d{3}$/.test(value)) {
    throw new RangeError(`Booking id must match RP-YYMMDD-NNN, got ${value}`);
  }
  return value as BookingId;
}

export function orgId(value: string): OrgId {
  if (value.trim().length === 0 || value.length > 64) {
    throw new RangeError(`Org id must be a non-empty string, got ${value}`);
  }
  return value as OrgId;
}

export function venueId(value: string): VenueId {
  if (value.trim().length === 0 || value.length > 64) {
    throw new RangeError(`Venue id must be a non-empty string, got ${value}`);
  }
  return value as VenueId;
}

export function staffId(value: number): StaffId {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`Staff id must be a positive integer, got ${value}`);
  }
  return value as StaffId;
}

export function courtId(value: number): CourtId {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`Court id must be a positive integer, got ${value}`);
  }
  return value as CourtId;
}

export function courtSessionId(value: number): CourtSessionId {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`Court session id must be a positive integer, got ${value}`);
  }
  return value as CourtSessionId;
}

export function assertNever({ value }: { value: never }): never {
  throw new Error(`Unhandled union variant: ${String(value)}`);
}

export type CourtStatus = "Available" | "Arriving soon" | "In play" | "Open play soon" | "Overtime";

export const COURT_STATUSES = [
  "Available",
  "Arriving soon",
  "In play",
  "Open play soon",
  "Overtime",
] as const satisfies readonly CourtStatus[];

export type BookingSource = "Messenger" | "Viber" | "Phone" | "Walk-in";

export const BOOKING_SOURCES = ["Messenger", "Viber", "Phone", "Walk-in"] as const satisfies readonly BookingSource[];

export type StaffRole = "Attendant" | "Manager" | "Invited";

export const STAFF_ROLES = ["Attendant", "Manager", "Invited"] as const satisfies readonly StaffRole[];

export type BookingStatus = "Reserved" | "Arrived" | "In play" | "Completed" | "Cancelled" | "No-show";

export type PaymentStatus = "Awaiting payment" | "In review" | "Verified" | "Rejected";

export const BOOKING_FLOW: Record<BookingStatus, readonly BookingStatus[]> = {
  Reserved: ["Arrived", "In play", "Cancelled", "No-show"],
  Arrived: ["In play", "No-show"],
  "In play": ["Completed"],
  Completed: [],
  Cancelled: [],
  "No-show": [],
};

export const PAYMENT_FLOW: Record<PaymentStatus, readonly PaymentStatus[]> = {
  "Awaiting payment": ["In review", "Verified"],
  "In review": ["Verified", "Rejected", "Awaiting payment"],
  Verified: [],
  Rejected: ["Awaiting payment"],
};

export type TransitionRequest =
  | { readonly flow: "booking"; readonly from: BookingStatus; readonly to: BookingStatus }
  | { readonly flow: "payment"; readonly from: PaymentStatus; readonly to: PaymentStatus };

export function canTransition(request: TransitionRequest): boolean {
  switch (request.flow) {
    case "booking":
      return BOOKING_FLOW[request.from].includes(request.to);
    case "payment":
      return PAYMENT_FLOW[request.from].includes(request.to);
    default:
      return assertNever({ value: request });
  }
}

export type Permission =
  | "book"
  | "manage-sessions"
  | "verify-payment"
  | "edit-rates"
  | "manage-staff"
  | "view-reports";

export const PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  Attendant: ["book", "manage-sessions"],
  Manager: ["book", "manage-sessions", "verify-payment", "edit-rates", "manage-staff", "view-reports"],
  Invited: [],
};

export function hasPermission({ role, permission }: { role: StaffRole; permission: Permission }): boolean {
  return PERMISSIONS[role].includes(permission);
}

export interface StatusPresentation {
  readonly kind: string;
  readonly accent: string;
  readonly action: string;
}

export function statusPresentation({ status }: { status: CourtStatus }): StatusPresentation {
  switch (status) {
    case "Available":
      return { kind: "mint", accent: "available", action: "Add walk-in" };
    case "Arriving soon":
      return { kind: "gold", accent: "arriving", action: "Check in" };
    case "In play":
      return { kind: "lavender", accent: "playing", action: "Extend" };
    case "Open play soon":
      return { kind: "pink", accent: "openplay", action: "Manage open play" };
    case "Overtime":
      return { kind: "danger", accent: "overtime", action: "End session" };
    default:
      return assertNever({ value: status });
  }
}

export interface Organization {
  readonly id: OrgId;
  readonly name: string;
}

export interface Venue {
  readonly id: VenueId;
  readonly orgId: OrgId;
  readonly name: string;
  readonly address: string | null;
  readonly contact: string | null;
  readonly timezone: string;
}

export interface StaffVenueMembership {
  readonly staffId: StaffId;
  readonly venueId: VenueId;
}

export interface Court {
  readonly id: CourtId;
  readonly venueId: VenueId;
  readonly name: string;
  readonly hourlyRate: Centavos;
  readonly bookable: boolean;
  readonly sortOrder: number;
}

export interface Booking {
  readonly id: BookingId;
  readonly venueId: VenueId;
  readonly courtId: CourtId;
  readonly customerName: string;
  readonly mobile: string | null;
  readonly source: BookingSource;
  readonly date: ManilaDate;
  readonly startMinute: MinutesFromMidnight;
  readonly durationMinutes: number;
  readonly players: number;
  readonly notes: string | null;
  readonly status: BookingStatus;
  readonly paymentStatus: PaymentStatus;
  readonly totalCentavos: Centavos | null;
  readonly createdByStaffId: StaffId;
}

export interface CourtSession {
  readonly id: CourtSessionId;
  readonly venueId: VenueId;
  readonly bookingId: BookingId;
  readonly courtId: CourtId;
  readonly scheduledEndMinute: MinutesFromMidnight;
  readonly startedMinute: MinutesFromMidnight;
  readonly endedMinute: MinutesFromMidnight | null;
}

export interface StaffMember {
  readonly id: StaffId;
  readonly orgId: OrgId;
  readonly name: string;
  readonly role: StaffRole;
}

export interface VenueSettings {
  readonly venueId: VenueId;
  readonly timezone: string;
  readonly currency: string;
  readonly openMinute: MinutesFromMidnight;
  readonly closeMinute: MinutesFromMidnight;
  readonly defaultPaymentStatus: PaymentStatus;
  readonly holdUnpaidMinutes: number;
  readonly paymentDetails: string | null;
}

export interface NewBookingInput {
  readonly courtId: CourtId;
  readonly customerName: string;
  readonly mobile: string | null;
  readonly source: BookingSource;
  readonly date: ManilaDate;
  readonly startMinute: MinutesFromMidnight;
  readonly durationMinutes: number;
  readonly players: number;
  readonly notes: string | null;
}

export interface ClashInfo {
  readonly court: string;
  readonly customer: string;
  readonly startMinute: MinutesFromMidnight;
  readonly endMinute: MinutesFromMidnight;
  readonly summary: string;
}

export interface TodayCourtCard {
  readonly courtId: CourtId;
  readonly court: string;
  readonly status: CourtStatus;
  readonly kind: string;
  readonly accent: string;
  readonly headline: string | null;
  readonly customer: string | null;
  readonly meta: string;
  readonly next: string;
  readonly action: string;
  readonly urgent: boolean;
}

export interface TodayResponse {
  readonly date: ManilaDate;
  readonly courts: readonly TodayCourtCard[];
}

export interface BookingDto {
  readonly id: BookingId;
  readonly venueId: VenueId;
  readonly courtId: CourtId;
  readonly customerName: string;
  readonly source: BookingSource;
  readonly date: ManilaDate;
  readonly startMinute: MinutesFromMidnight;
  readonly durationMinutes: number;
  readonly players: number;
  readonly status: BookingStatus;
  readonly paymentStatus: PaymentStatus;
  readonly totalCentavos: Centavos | null;
}
