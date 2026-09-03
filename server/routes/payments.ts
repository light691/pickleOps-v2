import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { canTransition, type StaffId } from "../../shared/types.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../domain/errors.ts";
import { unknownJson } from "../domain/validate.ts";
import { readAuth, requirePermission, requireStaff, requireVenue, type AuthedContext } from "../middleware.ts";
import {
  historyStage,
  parsePaymentRow,
  parseStatusFilter,
  parseSubmissionInput,
  parseVerdictInput,
  paymentId,
  type PaymentDto,
  type PaymentHistoryEvent,
  type PaymentSubmission,
} from "./paymentTypes.ts";

function errorStatus({ error }: { error: unknown }): { status: 400 | 403 | 404 | 409; body: Record<string, unknown> } {
  if (error instanceof ConflictError) return { status: 409, body: { error: error.message } };
  if (error instanceof ForbiddenError) return { status: 403, body: { error: error.message } };
  if (error instanceof NotFoundError) return { status: 404, body: { error: error.message } };
  if (error instanceof ValidationError) return { status: 400, body: { error: error.message } };
  throw error;
}

function staffName({ db, id }: { db: DatabaseSync; id: StaffId | null }): string | null {
  if (id === null) return null;
  const row = db.prepare("SELECT name FROM staff WHERE id = ?").get(id);
  if (typeof row !== "object" || row === null || !("name" in row) || typeof row.name !== "string") return null;
  return row.name;
}

function toDto({ db, submission }: { db: DatabaseSync; submission: PaymentSubmission }): PaymentDto {
  const history: PaymentHistoryEvent[] = [
    {
      stage: "Submitted",
      by: staffName({ db, id: submission.submittedBy }),
      at: submission.createdAt,
      note: submission.receipt,
    },
  ];
  const stage = historyStage({ status: submission.status });
  if (stage !== null) {
    history.push({
      stage,
      by: staffName({ db, id: submission.verifiedBy }),
      at: submission.verifiedAt ?? submission.createdAt,
      note: submission.staffNote,
    });
  }
  return { ...submission, history };
}

function loadPayment({
  db,
  venueId,
  rawId,
}: {
  db: DatabaseSync;
  venueId: string;
  rawId: string | undefined;
}): PaymentSubmission {
  if (rawId === undefined || !/^\d+$/.test(rawId)) {
    throw new ValidationError({ message: "Payment id must be a positive integer." });
  }
  const row = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId(Number(rawId)));
  if (row === undefined) throw new NotFoundError({ message: `Payment ${rawId} was not found.` });
  const payment = parsePaymentRow(row);
  if ((payment.venueId as string) !== venueId) {
    throw new ForbiddenError({ message: `Payment ${rawId} does not belong to this venue.` });
  }
  return payment;
}

export function createPaymentRoutes({ db }: { db: DatabaseSync }): Hono<AuthedContext> {
  const app = new Hono<AuthedContext>();
  const staffOnly = requireStaff({ db });
  const venueOnly = requireVenue({ db });

  app.get("/api/payments", staffOnly, venueOnly, (c) => {
    const parsed = parseStatusFilter(c.req.query("status"));
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
    const { venueId } = readAuth({ c, db });
    const rows = db
      .prepare("SELECT * FROM payments WHERE venue_id = ? AND status = ? ORDER BY id ASC")
      .all(venueId, parsed.value) as readonly unknown[];
    return c.json(rows.map((row) => toDto({ db, submission: parsePaymentRow(row) })));
  });

  app.post("/api/payments", staffOnly, venueOnly, requirePermission({ permission: "book" }), async (c) => {
    let body: unknown;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      return c.json({ errors: { body: "Expected a JSON object." } }, 400);
    }
    const parsed = parseSubmissionInput(body);
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
    const { staffId, venueId } = readAuth({ c, db });
    const createdAt = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO payments (venue_id, kind, ref_id, expected_centavos, submitted_centavos, method, txn_reference, payer_name, receipt, status, verified_by, verified_at, staff_note, submitted_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'In review', NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        venueId,
        parsed.value.kind,
        parsed.value.refId,
        parsed.value.expectedCentavos,
        parsed.value.submittedCentavos,
        parsed.value.method,
        parsed.value.txnReference,
        parsed.value.payerName,
        parsed.value.receipt,
        staffId,
        createdAt,
      );
    const row = db.prepare("SELECT * FROM payments WHERE id = ?").get(result.lastInsertRowid);
    return c.json(toDto({ db, submission: parsePaymentRow(row) }), 201);
  });

  app.patch("/api/payments/:id", staffOnly, venueOnly, requirePermission({ permission: "verify-payment" }), async (c) => {
    let body: unknown;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      return c.json({ errors: { body: "Expected a JSON object." } }, 400);
    }
    const parsed = parseVerdictInput(body);
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
    const { staffId, venueId } = readAuth({ c, db });
    try {
      const payment = loadPayment({ db, venueId: venueId as string, rawId: c.req.param("id") });
      if (!canTransition({ flow: "payment", from: payment.status, to: parsed.value.verdict })) {
        throw new ConflictError({ message: `Payment ${payment.id as number} is ${payment.status} and cannot change again.` });
      }
      const verifiedAt = new Date().toISOString();
      db.prepare("UPDATE payments SET status = ?, verified_by = ?, verified_at = ?, staff_note = ? WHERE id = ?").run(
        parsed.value.verdict,
        staffId,
        verifiedAt,
        parsed.value.staffNote,
        payment.id,
      );
      const row = db.prepare("SELECT * FROM payments WHERE id = ?").get(payment.id);
      return c.json(toDto({ db, submission: parsePaymentRow(row) }));
    } catch (error) {
      if (error instanceof ValidationError) return c.json({ errors: { id: error.message } }, 400);
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  return app;
}
