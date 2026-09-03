import { ApiError, getActiveVenueId, parseStaffPayload } from "../api.ts";
import {
  centavos,
  courtId,
  minuteOfDay,
  orgId,
  staffId,
  venueId,
  type Centavos,
  type CourtId,
  type MinutesFromMidnight,
  type PaymentStatus,
  type StaffId,
  type StaffRole,
  type VenueId,
} from "../../shared/types.ts";
import type {
  SettingsPaymentMethod,
  VenueSettingsPayload,
  VenueStaffEntry,
  CourtPayload,
} from "../../server/routes/settingsTypes.ts";

export type { SettingsPaymentMethod, VenueSettingsPayload, VenueStaffEntry, CourtPayload };

export interface SettingsUpdateInput {
  readonly name?: string;
  readonly address?: string | null;
  readonly contact?: string | null;
  readonly timezone?: string;
  readonly openMinute?: number;
  readonly closeMinute?: number;
  readonly bookingIntervalMinutes?: number;
  readonly defaultPaymentStatus?: PaymentStatus;
  readonly holdUnpaidMinutes?: number;
  readonly paymentDetails?: string | null;
  readonly paymentMethods?: readonly SettingsPaymentMethod[];
  readonly overtimeGraceMinutes?: number;
  readonly overtimeMinimumMinutes?: number;
}

export interface CourtCreateInput {
  readonly name: string;
  readonly hourlyRateCentavos: number;
  readonly bookable: boolean;
}

export interface CourtPatchInput {
  readonly name?: string;
  readonly hourlyRateCentavos?: number;
  readonly bookable?: boolean;
}

export interface StaffPatchInput {
  readonly role?: StaffRole;
  readonly active?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString({ record, field }: { record: Record<string, unknown>; field: string }): string {
  const value = record[field];
  if (typeof value !== "string") throw new ApiError({ message: `Unexpected settings response at ${field}.`, status: 502 });
  return value;
}

function optionalString({ record, field }: { record: Record<string, unknown>; field: string }): string | null {
  const value = record[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new ApiError({ message: `Unexpected settings response at ${field}.`, status: 502 });
  return value;
}

function requiredNumber({ record, field }: { record: Record<string, unknown>; field: string }): number {
  const value = record[field];
  if (typeof value !== "number") throw new ApiError({ message: `Unexpected settings response at ${field}.`, status: 502 });
  return value;
}

function requiredBoolean({ record, field }: { record: Record<string, unknown>; field: string }): boolean {
  const value = record[field];
  if (typeof value !== "boolean") throw new ApiError({ message: `Unexpected settings response at ${field}.`, status: 502 });
  return value;
}

function parsePaymentStatus({ value }: { value: unknown }): PaymentStatus {
  if (value === "Awaiting payment" || value === "In review" || value === "Verified" || value === "Rejected") return value;
  throw new ApiError({ message: "Unexpected payment status in settings response.", status: 502 });
}

function parseRole({ value }: { value: unknown }): StaffRole {
  if (value === "Attendant" || value === "Manager" || value === "Invited") return value;
  throw new ApiError({ message: "Unexpected staff role in settings response.", status: 502 });
}

function parsePaymentMethod({ value }: { value: unknown }): SettingsPaymentMethod {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected payment method in settings response.", status: 502 });
  return {
    name: requiredString({ record: value, field: "name" }),
    detail: requiredString({ record: value, field: "detail" }),
    enabled: requiredBoolean({ record: value, field: "enabled" }),
  };
}

export function parseSettingsPayload({ value }: { value: unknown }): VenueSettingsPayload {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected settings response.", status: 502 });
  const methods = value["paymentMethods"];
  if (!Array.isArray(methods)) throw new ApiError({ message: "Unexpected payment methods in settings response.", status: 502 });
  return {
    venueId: venueId(requiredString({ record: value, field: "venueId" })),
    name: requiredString({ record: value, field: "name" }),
    address: optionalString({ record: value, field: "address" }),
    contact: optionalString({ record: value, field: "contact" }),
    timezone: requiredString({ record: value, field: "timezone" }),
    currency: requiredString({ record: value, field: "currency" }),
    openMinute: minuteOfDay(requiredNumber({ record: value, field: "openMinute" })),
    closeMinute: minuteOfDay(requiredNumber({ record: value, field: "closeMinute" })),
    bookingIntervalMinutes: requiredNumber({ record: value, field: "bookingIntervalMinutes" }),
    defaultPaymentStatus: parsePaymentStatus({ value: value["defaultPaymentStatus"] }),
    holdUnpaidMinutes: requiredNumber({ record: value, field: "holdUnpaidMinutes" }),
    paymentDetails: optionalString({ record: value, field: "paymentDetails" }),
    paymentMethods: methods.map((entry) => parsePaymentMethod({ value: entry })),
    overtimeGraceMinutes: requiredNumber({ record: value, field: "overtimeGraceMinutes" }),
    overtimeMinimumMinutes: requiredNumber({ record: value, field: "overtimeMinimumMinutes" }),
  };
}

export function parseCourtPayload({ value }: { value: unknown }): CourtPayload {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected court in settings response.", status: 502 });
  return {
    id: courtId(requiredNumber({ record: value, field: "id" })),
    venueId: venueId(requiredString({ record: value, field: "venueId" })),
    name: requiredString({ record: value, field: "name" }),
    hourlyRateCentavos: centavos(requiredNumber({ record: value, field: "hourlyRateCentavos" })),
    bookable: requiredBoolean({ record: value, field: "bookable" }),
    sortOrder: requiredNumber({ record: value, field: "sortOrder" }),
  };
}

function parseCourtList({ value }: { value: unknown }): CourtPayload[] {
  if (!Array.isArray(value)) throw new ApiError({ message: "Unexpected courts in settings response.", status: 502 });
  return value.map((entry) => parseCourtPayload({ value: entry }));
}

export function parseStaffEntry({ value }: { value: unknown }): VenueStaffEntry {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected staff member in settings response.", status: 502 });
  return {
    id: staffId(requiredNumber({ record: value, field: "id" })),
    orgId: orgId(requiredString({ record: value, field: "orgId" })),
    name: requiredString({ record: value, field: "name" }),
    role: parseRole({ value: value["role"] }),
    active: requiredBoolean({ record: value, field: "active" }),
  };
}

function parseStaffList({ value }: { value: unknown }): VenueStaffEntry[] {
  if (!Array.isArray(value)) throw new ApiError({ message: "Unexpected staff list in settings response.", status: 502 });
  return value.map((entry) => parseStaffEntry({ value: entry }));
}

async function settingsRequest({
  path,
  method,
  body,
}: {
  path: string;
  method: string;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const active = getActiveVenueId();
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Venue-Id": `${active as string}`,
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

export async function fetchSettings(): Promise<VenueSettingsPayload> {
  return parseSettingsPayload({ value: await settingsRequest({ path: "/api/settings", method: "GET" }) });
}

export async function saveSettings({ input }: { input: SettingsUpdateInput }): Promise<VenueSettingsPayload> {
  const body: Record<string, unknown> = {};
  const assign = ({ key, value }: { key: string; value: unknown }): void => {
    if (value !== undefined) body[key] = value;
  };
  assign({ key: "name", value: input.name });
  assign({ key: "address", value: input.address });
  assign({ key: "contact", value: input.contact });
  assign({ key: "timezone", value: input.timezone });
  if (input.openMinute !== undefined) assign({ key: "openMinute", value: minuteOfDay(input.openMinute) as number });
  if (input.closeMinute !== undefined) assign({ key: "closeMinute", value: minuteOfDay(input.closeMinute) as number });
  assign({ key: "bookingIntervalMinutes", value: input.bookingIntervalMinutes });
  assign({ key: "defaultPaymentStatus", value: input.defaultPaymentStatus });
  assign({ key: "holdUnpaidMinutes", value: input.holdUnpaidMinutes });
  assign({ key: "paymentDetails", value: input.paymentDetails });
  assign({ key: "paymentMethods", value: input.paymentMethods });
  assign({ key: "overtimeGraceMinutes", value: input.overtimeGraceMinutes });
  assign({ key: "overtimeMinimumMinutes", value: input.overtimeMinimumMinutes });
  return parseSettingsPayload({ value: await settingsRequest({ path: "/api/settings", method: "PUT", body }) });
}

export async function fetchCourts(): Promise<CourtPayload[]> {
  return parseCourtList({ value: await settingsRequest({ path: "/api/courts", method: "GET" }) });
}

export async function createCourt({ input }: { input: CourtCreateInput }): Promise<CourtPayload> {
  return parseCourtPayload({
    value: await settingsRequest({
      path: "/api/courts",
      method: "POST",
      body: {
        name: input.name,
        hourlyRateCentavos: centavos(input.hourlyRateCentavos) as number,
        bookable: input.bookable,
      },
    }),
  });
}

export async function patchCourt({ id, input }: { id: CourtId; input: CourtPatchInput }): Promise<CourtPayload> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body["name"] = input.name;
  if (input.hourlyRateCentavos !== undefined) body["hourlyRateCentavos"] = centavos(input.hourlyRateCentavos) as number;
  if (input.bookable !== undefined) body["bookable"] = input.bookable;
  return parseCourtPayload({
    value: await settingsRequest({ path: `/api/courts/${id as number}`, method: "PATCH", body }),
  });
}

export async function fetchStaff(): Promise<VenueStaffEntry[]> {
  return parseStaffList({ value: await settingsRequest({ path: "/api/staff", method: "GET" }) });
}

export async function inviteStaff({ name }: { name: string }): Promise<VenueStaffEntry> {
  return parseStaffEntry({
    value: await settingsRequest({ path: "/api/staff", method: "POST", body: { name } }),
  });
}

export async function patchStaff({
  id,
  input,
}: {
  id: StaffId;
  input: StaffPatchInput;
}): Promise<VenueStaffEntry> {
  const body: Record<string, unknown> = {};
  if (input.role !== undefined) body["role"] = input.role;
  if (input.active !== undefined) body["active"] = input.active;
  return parseStaffEntry({
    value: await settingsRequest({ path: `/api/staff/${id as number}`, method: "PATCH", body }),
  });
}

export async function fetchMeRole(): Promise<StaffRole> {
  const res = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "same-origin",
    headers: { "X-Venue-Id": `${getActiveVenueId() as string}` },
  });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    throw new ApiError({ message: "Sign in to manage settings.", status: res.status });
  }
  return parseStaffPayload(payload).staff.role;
}

export function toTimeInput({ minute }: { minute: MinutesFromMidnight }): string {
  const raw = minute as number;
  return `${String(Math.floor(raw / 60)).padStart(2, "0")}:${String(raw % 60).padStart(2, "0")}`;
}

export function fromTimeInput({ value }: { value: string }): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match === null || match[1] === undefined || match[2] === undefined) return null;
  const hour = Number(match[1]);
  const rest = Number(match[2]);
  if (!Number.isSafeInteger(hour) || !Number.isSafeInteger(rest) || hour > 23 || rest > 59) return null;
  return hour * 60 + rest;
}

export function toPesos({ value }: { value: Centavos }): string {
  return String((value as number) / 100);
}

export function fromPesos({ value }: { value: string }): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

export type { Centavos, CourtId, MinutesFromMidnight, PaymentStatus, StaffId, StaffRole, VenueId };
