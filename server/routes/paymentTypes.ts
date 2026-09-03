import {
  assertNever,
  centavos,
  staffId,
  venueId,
  type Centavos,
  type PaymentStatus,
  type StaffId,
  type VenueId,
} from "../../shared/types.ts";

declare const paymentBrand: unique symbol;

export type PaymentId = number & { readonly [paymentBrand]: "PaymentId" };

export function paymentId(value: number): PaymentId {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`Payment id must be a positive integer, got ${value}`);
  }
  return value as PaymentId;
}

export const PAYMENT_KINDS = ["booking", "openplay"] as const;

export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_METHODS = ["GCash", "Maya", "Bank transfer", "Cash"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_VERDICTS = ["Verified", "Rejected"] as const;

export type PaymentVerdict = (typeof PAYMENT_VERDICTS)[number];

export interface PaymentSubmission {
  readonly id: PaymentId;
  readonly venueId: VenueId;
  readonly kind: PaymentKind;
  readonly refId: string;
  readonly expectedCentavos: Centavos;
  readonly submittedCentavos: Centavos;
  readonly method: PaymentMethod | null;
  readonly txnReference: string | null;
  readonly payerName: string;
  readonly receipt: string | null;
  readonly status: PaymentStatus;
  readonly verifiedBy: StaffId | null;
  readonly verifiedAt: string | null;
  readonly staffNote: string | null;
  readonly submittedBy: StaffId | null;
  readonly createdAt: string;
}

export type PaymentHistoryStage = "Submitted" | "Verified" | "Rejected";

export interface PaymentHistoryEvent {
  readonly stage: PaymentHistoryStage;
  readonly by: string | null;
  readonly at: string;
  readonly note: string | null;
}

export interface PaymentDto extends PaymentSubmission {
  readonly history: readonly PaymentHistoryEvent[];
}

export interface NewPaymentInput {
  readonly kind: PaymentKind;
  readonly refId: string;
  readonly expectedCentavos: Centavos;
  readonly submittedCentavos: Centavos;
  readonly method: PaymentMethod | null;
  readonly txnReference: string | null;
  readonly payerName: string;
  readonly receipt: string | null;
}

export interface VerdictInput {
  readonly verdict: PaymentVerdict;
  readonly staffNote: string | null;
}

export type FieldErrors = Record<string, string>;

export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: FieldErrors };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPaymentKind(value: unknown): value is PaymentKind {
  return PAYMENT_KINDS.some((candidate) => candidate === value);
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.some((candidate) => candidate === value);
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return (
    value === "Awaiting payment" || value === "In review" || value === "Verified" || value === "Rejected"
  );
}

function isPaymentVerdict(value: unknown): value is PaymentVerdict {
  return PAYMENT_VERDICTS.some((candidate) => candidate === value);
}

function requiredText({
  record,
  field,
  max,
}: {
  record: Record<string, unknown>;
  field: string;
  max: number;
}): string | null {
  const value = record[field];
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) return null;
  return value.trim();
}

function optionalText({
  record,
  field,
  max,
}: {
  record: Record<string, unknown>;
  field: string;
  max: number;
}): string | null | { error: true } {
  const value = record[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > max) return { error: true };
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function requiredCentavos({
  record,
  field,
  minimum,
}: {
  record: Record<string, unknown>;
  field: string;
  minimum: number;
}): Centavos | null {
  const value = record[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) return null;
  return centavos(value);
}

export function parseSubmissionInput(value: unknown): ParseResult<NewPaymentInput> {
  if (!isRecord(value)) return { ok: false, errors: { body: "Expected a JSON object." } };
  const errors: FieldErrors = {};

  const kind = value["kind"];
  if (!isPaymentKind(kind)) errors["kind"] = "Pick booking or open play.";

  const refId = requiredText({ record: value, field: "refId", max: 64 });
  if (refId === null) errors["refId"] = "Enter the booking or session reference.";

  const expectedCentavos = requiredCentavos({ record: value, field: "expectedCentavos", minimum: 0 });
  if (expectedCentavos === null) errors["expectedCentavos"] = "Expected amount must be zero or more centavos.";

  const submittedCentavos = requiredCentavos({ record: value, field: "submittedCentavos", minimum: 1 });
  if (submittedCentavos === null) errors["submittedCentavos"] = "Submitted amount must be at least 1 centavo.";

  const method = value["method"];
  if (!isPaymentMethod(method)) errors["method"] = "Pick GCash, Maya, Bank transfer, or Cash.";

  const txnReference = requiredText({ record: value, field: "txnReference", max: 120 });
  if (txnReference === null) errors["txnReference"] = "Enter the transaction reference.";

  const payerName = requiredText({ record: value, field: "payerName", max: 120 });
  if (payerName === null) errors["payerName"] = "Enter the payer name.";

  const receipt = optionalText({ record: value, field: "receipt", max: 500 });
  if (receipt !== null && typeof receipt === "object") errors["receipt"] = "Receipt note must be text.";

  if (
    Object.keys(errors).length > 0 ||
    !isPaymentKind(kind) ||
    refId === null ||
    expectedCentavos === null ||
    submittedCentavos === null ||
    !isPaymentMethod(method) ||
    txnReference === null ||
    payerName === null ||
    (receipt !== null && typeof receipt === "object")
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      kind,
      refId,
      expectedCentavos,
      submittedCentavos,
      method,
      txnReference,
      payerName,
      receipt,
    },
  };
}

export function parseVerdictInput(value: unknown): ParseResult<VerdictInput> {
  if (!isRecord(value)) return { ok: false, errors: { body: "Expected a JSON object." } };
  const errors: FieldErrors = {};
  const verdict = value["verdict"];
  if (!isPaymentVerdict(verdict)) {
    errors["verdict"] = "Verdict must be Verified or Rejected.";
    return { ok: false, errors };
  }
  switch (verdict) {
    case "Verified":
    case "Rejected":
      break;
    default:
      return assertNever({ value: verdict });
  }
  const staffNote = optionalText({ record: value, field: "staffNote", max: 500 });
  if (staffNote !== null && typeof staffNote === "object") {
    return { ok: false, errors: { staffNote: "Staff note must be text." } };
  }
  return { ok: true, value: { verdict, staffNote } };
}

export function parseStatusFilter(value: string | undefined): ParseResult<PaymentStatus> {
  if (value === undefined) return { ok: true, value: "In review" };
  const trimmed = value.trim();
  if (trimmed === "Review" || trimmed === "In review") return { ok: true, value: "In review" };
  if (trimmed === "Verified" || trimmed === "Rejected" || trimmed === "Awaiting payment") {
    return { ok: true, value: trimmed };
  }
  return { ok: false, errors: { status: "Status must be Review, Verified, or Rejected." } };
}

export function displayStatus({ status }: { status: PaymentStatus }): string {
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

function rowText({ row, field }: { row: Record<string, unknown>; field: string }): string {
  const value = row[field];
  if (typeof value !== "string") throw new TypeError(`Expected string in column ${field}`);
  return value;
}

function rowTextOrNull({ row, field }: { row: Record<string, unknown>; field: string }): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "string") throw new TypeError(`Expected string or null in column ${field}`);
  return value;
}

function rowNumber({ row, field }: { row: Record<string, unknown>; field: string }): number {
  const value = row[field];
  if (typeof value !== "number") throw new TypeError(`Expected number in column ${field}`);
  return value;
}

function rowNumberOrNull({ row, field }: { row: Record<string, unknown>; field: string }): number | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "number") throw new TypeError(`Expected number or null in column ${field}`);
  return value;
}

export function parsePaymentRow(row: unknown): PaymentSubmission {
  if (!isRecord(row)) throw new TypeError("Expected payments row object");
  const kind = row["kind"];
  if (!isPaymentKind(kind)) throw new TypeError(`Unknown payment kind in database: ${String(kind)}`);
  const method = row["method"];
  if (method !== null && !isPaymentMethod(method)) {
    throw new TypeError(`Unknown payment method in database: ${String(method)}`);
  }
  const status = row["status"];
  if (!isPaymentStatus(status)) throw new TypeError(`Unknown payment status in database: ${String(status)}`);
  const verifiedBy = rowNumberOrNull({ row, field: "verified_by" });
  const submittedBy = rowNumberOrNull({ row, field: "submitted_by" });
  return {
    id: paymentId(rowNumber({ row, field: "id" })),
    venueId: venueId(rowText({ row, field: "venue_id" })),
    kind,
    refId: rowText({ row, field: "ref_id" }),
    expectedCentavos: centavos(rowNumber({ row, field: "expected_centavos" })),
    submittedCentavos: centavos(rowNumber({ row, field: "submitted_centavos" })),
    method,
    txnReference: rowTextOrNull({ row, field: "txn_reference" }),
    payerName: rowText({ row, field: "payer_name" }),
    receipt: rowTextOrNull({ row, field: "receipt" }),
    status,
    verifiedBy: verifiedBy === null ? null : staffId(verifiedBy),
    verifiedAt: rowTextOrNull({ row, field: "verified_at" }),
    staffNote: rowTextOrNull({ row, field: "staff_note" }),
    submittedBy: submittedBy === null ? null : staffId(submittedBy),
    createdAt: rowText({ row, field: "created_at" }),
  };
}

export function historyStage({ status }: { status: PaymentStatus }): PaymentHistoryStage | null {
  switch (status) {
    case "Awaiting payment":
      return null;
    case "In review":
      return null;
    case "Verified":
      return "Verified";
    case "Rejected":
      return "Rejected";
    default:
      return assertNever({ value: status });
  }
}
