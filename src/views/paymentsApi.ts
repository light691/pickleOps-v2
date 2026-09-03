import { ApiError, getActiveVenueId } from "../api.ts";
import { assertNever, type PaymentStatus, type VenueId } from "../../shared/types.ts";

export type PaymentKind = "booking" | "openplay";

export type PaymentMethod = "GCash" | "Maya" | "Bank transfer" | "Cash";

export type PaymentHistoryStage = "Submitted" | "Verified" | "Rejected";

export interface PaymentHistoryEvent {
  readonly stage: PaymentHistoryStage;
  readonly by: string | null;
  readonly at: string;
  readonly note: string | null;
}

export interface PaymentItem {
  readonly id: number;
  readonly venueId: string;
  readonly kind: PaymentKind;
  readonly refId: string;
  readonly expectedCentavos: number;
  readonly submittedCentavos: number;
  readonly method: PaymentMethod | null;
  readonly txnReference: string | null;
  readonly payerName: string;
  readonly receipt: string | null;
  readonly status: PaymentStatus;
  readonly verifiedBy: number | null;
  readonly verifiedAt: string | null;
  readonly staffNote: string | null;
  readonly submittedBy: number | null;
  readonly createdAt: string;
  readonly history: readonly PaymentHistoryEvent[];
}

export interface NewPaymentRequest {
  readonly kind: PaymentKind;
  readonly refId: string;
  readonly expectedCentavos: number;
  readonly submittedCentavos: number;
  readonly method: PaymentMethod;
  readonly txnReference: string;
  readonly payerName: string;
  readonly receipt: string | null;
}

export type PaymentVerdict = "Verified" | "Rejected";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString({ record, field }: { record: Record<string, unknown>; field: string }): string {
  const value = record[field];
  if (typeof value !== "string") throw new ApiError({ message: `Unexpected payment shape at ${field}.`, status: 502 });
  return value;
}

function optionalString({ record, field }: { record: Record<string, unknown>; field: string }): string | null {
  const value = record[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new ApiError({ message: `Unexpected payment shape at ${field}.`, status: 502 });
  return value;
}

function requiredAmount({ record, field }: { record: Record<string, unknown>; field: string }): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ApiError({ message: `Unexpected payment shape at ${field}.`, status: 502 });
  }
  return value;
}

function optionalId({ record, field }: { record: Record<string, unknown>; field: string }): number | null {
  const value = record[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ApiError({ message: `Unexpected payment shape at ${field}.`, status: 502 });
  }
  return value;
}

function parseKind({ value }: { value: unknown }): PaymentKind {
  if (value === "booking" || value === "openplay") return value;
  throw new ApiError({ message: "Unexpected payment kind in response.", status: 502 });
}

function parseMethod({ value }: { value: unknown }): PaymentMethod | null {
  if (value === null) return null;
  if (value === "GCash" || value === "Maya" || value === "Bank transfer" || value === "Cash") return value;
  throw new ApiError({ message: "Unexpected payment method in response.", status: 502 });
}

function parseStatus({ value }: { value: unknown }): PaymentStatus {
  if (value === "Awaiting payment" || value === "In review" || value === "Verified" || value === "Rejected") {
    return value;
  }
  throw new ApiError({ message: "Unexpected payment status in response.", status: 502 });
}

function parseStage({ value }: { value: unknown }): PaymentHistoryStage {
  if (value === "Submitted" || value === "Verified" || value === "Rejected") return value;
  throw new ApiError({ message: "Unexpected payment history in response.", status: 502 });
}

function parseHistoryEvent(value: unknown): PaymentHistoryEvent {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected payment history in response.", status: 502 });
  return {
    stage: parseStage({ value: value["stage"] }),
    by: optionalString({ record: value, field: "by" }),
    at: requiredString({ record: value, field: "at" }),
    note: optionalString({ record: value, field: "note" }),
  };
}

export function displayPaymentStatus({ status }: { status: PaymentStatus }): string {
  switch (status) {
    case "Awaiting payment":
      return "Awaiting payment";
    case "In review":
      return "Review";
    case "Verified":
      return "Verified";
    case "Rejected":
      return "Rejected";
    default:
      return assertNever({ value: status });
  }
}

export function pillKind({ status }: { status: PaymentStatus }): string {
  switch (status) {
    case "Awaiting payment":
      return "gold";
    case "In review":
      return "pink";
    case "Verified":
      return "mint";
    case "Rejected":
      return "gold";
    default:
      return assertNever({ value: status });
  }
}

export function formatCentavos({ value }: { value: number }): string {
  return `₱${(value / 100).toFixed(2)}`;
}

export function parsePaymentItem(value: unknown): PaymentItem {
  if (!isRecord(value)) throw new ApiError({ message: "Unexpected payment in response.", status: 502 });
  const history = value["history"];
  if (!Array.isArray(history)) throw new ApiError({ message: "Unexpected payment history in response.", status: 502 });
  const id = requiredAmount({ record: value, field: "id" });
  if (id <= 0) throw new ApiError({ message: "Unexpected payment in response.", status: 502 });
  return {
    id,
    venueId: requiredString({ record: value, field: "venueId" }),
    kind: parseKind({ value: value["kind"] }),
    refId: requiredString({ record: value, field: "refId" }),
    expectedCentavos: requiredAmount({ record: value, field: "expectedCentavos" }),
    submittedCentavos: requiredAmount({ record: value, field: "submittedCentavos" }),
    method: parseMethod({ value: value["method"] }),
    txnReference: value["txnReference"] === null ? null : requiredString({ record: value, field: "txnReference" }),
    payerName: requiredString({ record: value, field: "payerName" }),
    receipt: optionalString({ record: value, field: "receipt" }),
    status: parseStatus({ value: value["status"] }),
    verifiedBy: optionalId({ record: value, field: "verifiedBy" }),
    verifiedAt: optionalString({ record: value, field: "verifiedAt" }),
    staffNote: optionalString({ record: value, field: "staffNote" }),
    submittedBy: optionalId({ record: value, field: "submittedBy" }),
    createdAt: requiredString({ record: value, field: "createdAt" }),
    history: history.map((entry) => parseHistoryEvent(entry)),
  };
}

function parsePaymentList(value: unknown): readonly PaymentItem[] {
  if (!Array.isArray(value)) throw new ApiError({ message: "Unexpected payments response.", status: 502 });
  return value.map((entry) => parsePaymentItem(entry));
}

async function request({
  path,
  method,
  body,
}: {
  path: string;
  method: string;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Venue-Id": getActiveVenueId() as string,
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

export async function listPayments({ status }: { status?: string }): Promise<readonly PaymentItem[]> {
  const query = status === undefined ? "" : `?status=${encodeURIComponent(status)}`;
  return parsePaymentList(await request({ path: `/api/payments${query}`, method: "GET" }));
}

export async function submitPayment({ input }: { input: NewPaymentRequest }): Promise<PaymentItem> {
  return parsePaymentItem(
    await request({
      path: "/api/payments",
      method: "POST",
      body: {
        kind: input.kind,
        refId: input.refId,
        expectedCentavos: input.expectedCentavos,
        submittedCentavos: input.submittedCentavos,
        method: input.method,
        txnReference: input.txnReference,
        payerName: input.payerName,
        receipt: input.receipt,
      },
    }),
  );
}

export async function decidePayment({
  id,
  verdict,
  staffNote,
}: {
  id: number;
  verdict: PaymentVerdict;
  staffNote: string | null;
}): Promise<PaymentItem> {
  return parsePaymentItem(
    await request({ path: `/api/payments/${id}`, method: "PATCH", body: { verdict, staffNote } }),
  );
}

export type { VenueId };
