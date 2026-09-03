import {
  assertNever,
  centavos,
  courtId,
  minuteOfDay,
  orgId,
  staffId,
  venueId,
  type BookingStatus,
  type Centavos,
  type CourtId,
  type CourtSession,
  type MinutesFromMidnight,
  type OrgId,
  type PaymentStatus,
  type StaffId,
  type StaffRole,
  type VenueId,
} from "../../shared/types.ts";

export const SETTINGS_TIMEZONES = ["Asia/Manila"] as const;

export type SettingsTimezone = (typeof SETTINGS_TIMEZONES)[number];

export const BOOKING_INTERVALS = [15, 30, 60] as const;

export type BookingIntervalMinutes = (typeof BOOKING_INTERVALS)[number];

export const STAFF_CHANGE_ACTIONS = ["invited", "role-changed", "deactivated", "reactivated"] as const;

export type StaffChangeAction = (typeof STAFF_CHANGE_ACTIONS)[number];

export interface SettingsPaymentMethod {
  readonly name: string;
  readonly detail: string;
  readonly enabled: boolean;
}

export interface VenueSettingsPayload {
  readonly venueId: VenueId;
  readonly name: string;
  readonly address: string | null;
  readonly contact: string | null;
  readonly timezone: string;
  readonly currency: string;
  readonly openMinute: MinutesFromMidnight;
  readonly closeMinute: MinutesFromMidnight;
  readonly bookingIntervalMinutes: number;
  readonly defaultPaymentStatus: PaymentStatus;
  readonly holdUnpaidMinutes: number;
  readonly paymentDetails: string | null;
  readonly paymentMethods: readonly SettingsPaymentMethod[];
  readonly overtimeGraceMinutes: number;
  readonly overtimeMinimumMinutes: number;
}

export interface SettingsUpdate {
  readonly name?: string;
  readonly address?: string | null;
  readonly contact?: string | null;
  readonly timezone?: string;
  readonly openMinute?: MinutesFromMidnight;
  readonly closeMinute?: MinutesFromMidnight;
  readonly bookingIntervalMinutes?: number;
  readonly defaultPaymentStatus?: PaymentStatus;
  readonly holdUnpaidMinutes?: number;
  readonly paymentDetails?: string | null;
  readonly paymentMethods?: readonly SettingsPaymentMethod[];
  readonly overtimeGraceMinutes?: number;
  readonly overtimeMinimumMinutes?: number;
}

export interface CourtPayload {
  readonly id: CourtId;
  readonly venueId: VenueId;
  readonly name: string;
  readonly hourlyRateCentavos: Centavos;
  readonly bookable: boolean;
  readonly sortOrder: number;
}

export interface CourtCreate {
  readonly name: string;
  readonly hourlyRateCentavos: Centavos;
  readonly bookable: boolean;
}

export interface CourtPatch {
  readonly name?: string;
  readonly hourlyRateCentavos?: Centavos;
  readonly bookable?: boolean;
}

export interface VenueStaffEntry {
  readonly id: StaffId;
  readonly orgId: OrgId;
  readonly name: string;
  readonly role: StaffRole;
  readonly active: boolean;
}

export interface StaffInvite {
  readonly name: string;
}

export interface StaffPatch {
  readonly role?: StaffRole;
  readonly active?: boolean;
}

export interface StaffChangeRecord {
  readonly venueId: VenueId;
  readonly staffId: StaffId;
  readonly actorStaffId: StaffId;
  readonly action: StaffChangeAction;
  readonly detail: string | null;
}

export type FieldErrors = Record<string, string>;

export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: FieldErrors };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readOptionalText({
  record,
  field,
  errors,
  maxLength,
}: {
  record: Record<string, unknown>;
  field: string;
  errors: FieldErrors;
  maxLength: number;
}): string | null | undefined {
  const raw = record[field];
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") {
    errors[field] = "Must be text.";
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length > maxLength) {
    errors[field] = `Keep this under ${maxLength} characters.`;
    return undefined;
  }
  return trimmed;
}

function readRequiredText({
  record,
  field,
  errors,
  maxLength,
}: {
  record: Record<string, unknown>;
  field: string;
  errors: FieldErrors;
  maxLength: number;
}): string | null {
  const raw = record[field];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    errors[field] = "This field is required.";
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length > maxLength) {
    errors[field] = `Keep this under ${maxLength} characters.`;
    return null;
  }
  return trimmed;
}

function readMinute({
  record,
  field,
  errors,
}: {
  record: Record<string, unknown>;
  field: string;
  errors: FieldErrors;
}): MinutesFromMidnight | null | undefined {
  const raw = record[field];
  if (raw === undefined) return undefined;
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0 || raw >= 1440) {
    errors[field] = "Enter a time between 00:00 and 23:59.";
    return undefined;
  }
  try {
    return minuteOfDay(raw);
  } catch {
    errors[field] = "Enter a time between 00:00 and 23:59.";
    return undefined;
  }
}

function readIntRange({
  record,
  field,
  errors,
  min,
  max,
}: {
  record: Record<string, unknown>;
  field: string;
  errors: FieldErrors;
  min: number;
  max: number;
}): number | undefined {
  const raw = record[field];
  if (raw === undefined) return undefined;
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < min || raw > max) {
    errors[field] = `Enter a whole number between ${min} and ${max}.`;
    return undefined;
  }
  return raw;
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return (
    value === "Awaiting payment" || value === "In review" || value === "Verified" || value === "Rejected"
  );
}

function isBookingStatus(value: unknown): value is BookingStatus {
  return (
    value === "Reserved" ||
    value === "Arrived" ||
    value === "In play" ||
    value === "Completed" ||
    value === "Cancelled" ||
    value === "No-show"
  );
}

function defaultStatusLabel({ status }: { status: PaymentStatus }): string {
  switch (status) {
    case "Awaiting payment":
      return "Unpaid holds";
    case "In review":
      return "Review holds";
    case "Verified":
      return "Paid holds";
    case "Rejected":
      return "Rejected holds";
    default:
      return assertNever({ value: status });
  }
}

function bookingStatusLabel({ status }: { status: BookingStatus }): string {
  switch (status) {
    case "Reserved":
      return "reserved";
    case "Arrived":
      return "arrived";
    case "In play":
      return "in play";
    case "Completed":
      return "completed";
    case "Cancelled":
      return "cancelled";
    case "No-show":
      return "no-show";
    default:
      return assertNever({ value: status });
  }
}

export function describeDefaults({ status }: { status: PaymentStatus }): string {
  return defaultStatusLabel({ status });
}

export function describeBookingStatus({ status }: { status: BookingStatus }): string {
  return bookingStatusLabel({ status });
}

function parsePaymentMethod({ value }: { value: unknown }): SettingsPaymentMethod | null {
  if (!isRecord(value)) return null;
  const name = value["name"];
  const detail = value["detail"];
  const enabled = value["enabled"];
  if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 40) return null;
  if (typeof detail !== "string" || detail.trim().length > 200) return null;
  if (typeof enabled !== "boolean") return null;
  return { name: name.trim(), detail: detail.trim(), enabled };
}

function parsePaymentMethods({ value }: { value: unknown }): readonly SettingsPaymentMethod[] | null {
  if (!Array.isArray(value) || value.length > 8) return null;
  const methods: SettingsPaymentMethod[] = [];
  for (const entry of value) {
    const parsed = parsePaymentMethod({ value: entry });
    if (parsed === null) return null;
    methods.push(parsed);
  }
  return methods;
}

export function parseSettingsUpdate({ value }: { value: unknown }): ParseResult<SettingsUpdate> {
  if (!isRecord(value)) {
    return { ok: false, errors: { body: "Expected a JSON object." } };
  }
  const errors: FieldErrors = {};
  const update: {
    name?: string;
    address?: string | null;
    contact?: string | null;
    timezone?: string;
    openMinute?: MinutesFromMidnight;
    closeMinute?: MinutesFromMidnight;
    bookingIntervalMinutes?: number;
    defaultPaymentStatus?: PaymentStatus;
    holdUnpaidMinutes?: number;
    paymentDetails?: string | null;
    paymentMethods?: readonly SettingsPaymentMethod[];
    overtimeGraceMinutes?: number;
    overtimeMinimumMinutes?: number;
  } = {};

  if (value["name"] !== undefined) {
    const name = readRequiredText({ record: value, field: "name", errors, maxLength: 120 });
    if (name !== null) update.name = name;
  }
  const address = readOptionalText({ record: value, field: "address", errors, maxLength: 255 });
  if (address !== undefined) update.address = address;
  const contact = readOptionalText({ record: value, field: "contact", errors, maxLength: 64 });
  if (contact !== undefined) update.contact = contact;

  if (value["timezone"] !== undefined) {
    const raw = value["timezone"];
    if (typeof raw !== "string" || !(SETTINGS_TIMEZONES as readonly string[]).includes(raw)) {
      errors["timezone"] = "Timezone must be Asia/Manila.";
    } else {
      update.timezone = raw;
    }
  }

  const openMinute = readMinute({ record: value, field: "openMinute", errors });
  if (openMinute !== undefined && openMinute !== null) update.openMinute = openMinute;
  const closeMinute = readMinute({ record: value, field: "closeMinute", errors });
  if (closeMinute !== undefined && closeMinute !== null) update.closeMinute = closeMinute;
  if (update.openMinute !== undefined && update.closeMinute !== undefined) {
    if ((update.openMinute as number) >= (update.closeMinute as number)) {
      errors["closeMinute"] = "Closing time must be after opening time.";
    }
  }

  if (value["bookingIntervalMinutes"] !== undefined) {
    const raw = value["bookingIntervalMinutes"];
    if (typeof raw !== "number" || !(BOOKING_INTERVALS as readonly number[]).includes(raw)) {
      errors["bookingIntervalMinutes"] = "Booking interval must be 15, 30, or 60 minutes.";
    } else {
      update.bookingIntervalMinutes = raw;
    }
  }

  if (value["defaultPaymentStatus"] !== undefined) {
    const raw = value["defaultPaymentStatus"];
    if (!isPaymentStatus(raw)) {
      errors["defaultPaymentStatus"] = "Pick a valid default payment status.";
    } else {
      update.defaultPaymentStatus = raw;
    }
  }

  const hold = readIntRange({ record: value, field: "holdUnpaidMinutes", errors, min: 0, max: 240 });
  if (hold !== undefined) update.holdUnpaidMinutes = hold;

  const details = readOptionalText({ record: value, field: "paymentDetails", errors, maxLength: 500 });
  if (details !== undefined) update.paymentDetails = details;

  if (value["paymentMethods"] !== undefined) {
    const parsed = parsePaymentMethods({ value: value["paymentMethods"] });
    if (parsed === null) {
      errors["paymentMethods"] = "Payment methods must list up to 8 entries with a name, detail, and enabled flag.";
    } else {
      update.paymentMethods = parsed;
    }
  }

  const grace = readIntRange({ record: value, field: "overtimeGraceMinutes", errors, min: 0, max: 60 });
  if (grace !== undefined) update.overtimeGraceMinutes = grace;
  const minimum = readIntRange({ record: value, field: "overtimeMinimumMinutes", errors, min: 0, max: 120 });
  if (minimum !== undefined) update.overtimeMinimumMinutes = minimum;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: update };
}

export function parseCourtCreate({ value }: { value: unknown }): ParseResult<CourtCreate> {
  if (!isRecord(value)) {
    return { ok: false, errors: { body: "Expected a JSON object." } };
  }
  const errors: FieldErrors = {};
  const name = readRequiredText({ record: value, field: "name", errors, maxLength: 60 });
  let rate: Centavos | null = null;
  const rawRate = value["hourlyRateCentavos"];
  if (typeof rawRate !== "number" || !Number.isSafeInteger(rawRate) || rawRate <= 0 || rawRate > 100000000) {
    errors["hourlyRateCentavos"] = "Hourly rate must be a positive amount in centavos.";
  } else {
    try {
      rate = centavos(rawRate);
    } catch {
      errors["hourlyRateCentavos"] = "Hourly rate must be a positive amount in centavos.";
    }
  }
  let bookable = true;
  const rawBookable = value["bookable"];
  if (rawBookable !== undefined) {
    if (typeof rawBookable !== "boolean") {
      errors["bookable"] = "Bookable must be true or false.";
    } else {
      bookable = rawBookable;
    }
  }
  if (Object.keys(errors).length > 0 || name === null || rate === null) {
    return { ok: false, errors };
  }
  return { ok: true, value: { name, hourlyRateCentavos: rate, bookable } };
}

export function parseCourtPatch({ value }: { value: unknown }): ParseResult<CourtPatch> {
  if (!isRecord(value)) {
    return { ok: false, errors: { body: "Expected a JSON object." } };
  }
  const errors: FieldErrors = {};
  const patch: { name?: string; hourlyRateCentavos?: Centavos; bookable?: boolean } = {};
  if (value["name"] !== undefined) {
    const name = readRequiredText({ record: value, field: "name", errors, maxLength: 60 });
    if (name !== null) patch.name = name;
  }
  if (value["hourlyRateCentavos"] !== undefined) {
    const rawRate = value["hourlyRateCentavos"];
    if (typeof rawRate !== "number" || !Number.isSafeInteger(rawRate) || rawRate <= 0 || rawRate > 100000000) {
      errors["hourlyRateCentavos"] = "Hourly rate must be a positive amount in centavos.";
    } else {
      try {
        patch.hourlyRateCentavos = centavos(rawRate);
      } catch {
        errors["hourlyRateCentavos"] = "Hourly rate must be a positive amount in centavos.";
      }
    }
  }
  if (value["bookable"] !== undefined) {
    const rawBookable = value["bookable"];
    if (typeof rawBookable !== "boolean") {
      errors["bookable"] = "Bookable must be true or false.";
    } else {
      patch.bookable = rawBookable;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (patch.name === undefined && patch.hourlyRateCentavos === undefined && patch.bookable === undefined) {
    return { ok: false, errors: { body: "Send at least one field to update." } };
  }
  return { ok: true, value: patch };
}

export function parseStaffInvite({ value }: { value: unknown }): ParseResult<StaffInvite> {
  if (!isRecord(value)) {
    return { ok: false, errors: { body: "Expected a JSON object." } };
  }
  const errors: FieldErrors = {};
  const name = readRequiredText({ record: value, field: "name", errors, maxLength: 120 });
  if (Object.keys(errors).length > 0 || name === null) {
    return { ok: false, errors };
  }
  return { ok: true, value: { name } };
}

function isSettableRole(value: unknown): value is StaffRole {
  return value === "Attendant" || value === "Manager";
}

export function parseStaffPatch({ value }: { value: unknown }): ParseResult<StaffPatch> {
  if (!isRecord(value)) {
    return { ok: false, errors: { body: "Expected a JSON object." } };
  }
  const errors: FieldErrors = {};
  const patch: { role?: StaffRole; active?: boolean } = {};
  if (value["role"] !== undefined) {
    if (!isSettableRole(value["role"])) {
      errors["role"] = "Role must be Attendant or Manager.";
    } else {
      patch.role = value["role"];
    }
  }
  if (value["active"] !== undefined) {
    if (typeof value["active"] !== "boolean") {
      errors["active"] = "Active must be true or false.";
    } else {
      patch.active = value["active"];
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (patch.role === undefined && patch.active === undefined) {
    return { ok: false, errors: { body: "Send a role or active flag to update." } };
  }
  return { ok: true, value: patch };
}

export function parseCourtIdParam({ raw }: { raw: string | undefined }): ParseResult<CourtId> {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return { ok: false, errors: { id: "Court id must be a positive integer." } };
  }
  const numeric = Number(raw);
  try {
    return { ok: true, value: courtId(numeric) };
  } catch {
    return { ok: false, errors: { id: "Court id must be a positive integer." } };
  }
}

export function parseStaffIdParam({ raw }: { raw: string | undefined }): ParseResult<StaffId> {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return { ok: false, errors: { id: "Staff id must be a positive integer." } };
  }
  const numeric = Number(raw);
  try {
    return { ok: true, value: staffId(numeric) };
  } catch {
    return { ok: false, errors: { id: "Staff id must be a positive integer." } };
  }
}

interface SettingsRow {
  readonly venue_id: string;
  readonly timezone: string;
  readonly currency: string;
  readonly open_minute: number;
  readonly close_minute: number;
  readonly default_payment_status: string;
  readonly hold_unpaid_minutes: number;
  readonly payment_details: string | null;
  readonly booking_interval_minutes: number;
  readonly overtime_grace_minutes: number;
  readonly overtime_minimum_minutes: number;
  readonly payment_methods: string | null;
}

function readRowText({ row, field }: { row: Record<string, unknown>; field: string }): string {
  const raw = row[field];
  if (typeof raw !== "string") throw new TypeError(`Expected string in settings column ${field}`);
  return raw;
}

function readRowTextOrNull({ row, field }: { row: Record<string, unknown>; field: string }): string | null {
  const raw = row[field];
  if (raw === null) return null;
  if (typeof raw !== "string") throw new TypeError(`Expected string or null in settings column ${field}`);
  return raw;
}

function readRowNumber({ row, field }: { row: Record<string, unknown>; field: string }): number {
  const raw = row[field];
  if (typeof raw !== "number") throw new TypeError(`Expected number in settings column ${field}`);
  return raw;
}

function toSettingsRow({ value }: { value: unknown }): SettingsRow {
  if (!isRecord(value)) throw new TypeError("Expected venue_settings row object");
  const defaultPaymentStatus = readRowText({ row: value, field: "default_payment_status" });
  if (defaultPaymentStatus !== "Awaiting payment" && defaultPaymentStatus !== "In review" && defaultPaymentStatus !== "Verified" && defaultPaymentStatus !== "Rejected") {
    throw new TypeError(`Unknown payment status in database: ${defaultPaymentStatus}`);
  }
  return {
    venue_id: readRowText({ row: value, field: "venue_id" }),
    timezone: readRowText({ row: value, field: "timezone" }),
    currency: readRowText({ row: value, field: "currency" }),
    open_minute: readRowNumber({ row: value, field: "open_minute" }),
    close_minute: readRowNumber({ row: value, field: "close_minute" }),
    default_payment_status: defaultPaymentStatus,
    hold_unpaid_minutes: readRowNumber({ row: value, field: "hold_unpaid_minutes" }),
    payment_details: readRowTextOrNull({ row: value, field: "payment_details" }),
    booking_interval_minutes: readRowNumber({ row: value, field: "booking_interval_minutes" }),
    overtime_grace_minutes: readRowNumber({ row: value, field: "overtime_grace_minutes" }),
    overtime_minimum_minutes: readRowNumber({ row: value, field: "overtime_minimum_minutes" }),
    payment_methods: readRowTextOrNull({ row: value, field: "payment_methods" }),
  };
}

export function toSettingsPayload({
  venue,
  settingsRow,
}: {
  venue: { id: VenueId; name: string; address: string | null; contact: string | null; timezone: string };
  settingsRow: unknown;
}): VenueSettingsPayload {
  const row = toSettingsRow({ value: settingsRow });
  const status = row.default_payment_status;
  if (!isPaymentStatus(status)) throw new TypeError(`Unknown payment status in database: ${status}`);
  const methods = row.payment_methods === null ? [] : parsePaymentMethods({ value: JSON.parse(row.payment_methods) });
  if (methods === null) throw new TypeError("Stored payment methods are corrupt");
  return {
    venueId: venue.id,
    name: venue.name,
    address: venue.address,
    contact: venue.contact,
    timezone: venue.timezone,
    currency: row.currency,
    openMinute: minuteOfDay(row.open_minute),
    closeMinute: minuteOfDay(row.close_minute),
    bookingIntervalMinutes: row.booking_interval_minutes,
    defaultPaymentStatus: status,
    holdUnpaidMinutes: row.hold_unpaid_minutes,
    paymentDetails: row.payment_details,
    paymentMethods: methods,
    overtimeGraceMinutes: row.overtime_grace_minutes,
    overtimeMinimumMinutes: row.overtime_minimum_minutes,
  };
}

export function toCourtPayload({ row }: { row: unknown }): CourtPayload {
  if (!isRecord(row)) throw new TypeError("Expected court row object");
  const id = row["id"];
  const venue = row["venue_id"];
  const name = row["name"];
  const rate = row["hourly_rate_centavos"];
  const bookable = row["bookable"];
  const sortOrder = row["sort_order"];
  if (typeof id !== "number" || typeof venue !== "string" || typeof name !== "string") {
    throw new TypeError("Expected court row columns");
  }
  if (typeof rate !== "number" || typeof bookable !== "number" || typeof sortOrder !== "number") {
    throw new TypeError("Expected court row columns");
  }
  return {
    id: courtId(id),
    venueId: venueId(venue),
    name,
    hourlyRateCentavos: centavos(rate),
    bookable: bookable === 1,
    sortOrder,
  };
}

export function toStaffEntry({ row }: { row: unknown }): VenueStaffEntry {
  if (!isRecord(row)) throw new TypeError("Expected staff row object");
  const id = row["id"];
  const org = row["org_id"];
  const name = row["name"];
  const role = row["role"];
  if (typeof id !== "number" || typeof org !== "string" || typeof name !== "string" || typeof role !== "string") {
    throw new TypeError("Expected staff row columns");
  }
  if (role !== "Attendant" && role !== "Manager" && role !== "Invited") {
    throw new TypeError(`Unknown staff role in database: ${role}`);
  }
  const active = row["active"];
  if (active !== undefined && active !== null && active !== 0 && active !== 1) {
    throw new TypeError("Expected active flag in staff row");
  }
  return {
    id: staffId(id),
    orgId: orgId(org),
    name,
    role,
    active: active === undefined || active === null ? true : active === 1,
  };
}

export function sessionSummary({ session }: { session: CourtSession }): string {
  return `Session ${session.id} on court ${session.courtId}`;
}
