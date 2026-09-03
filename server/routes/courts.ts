import type { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import type { CourtId, VenueId } from "../../shared/types.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../domain/errors.ts";
import { unknownJson } from "../domain/validate.ts";
import { readAuth, requirePermission, requireStaff, requireVenue, type AuthedContext } from "../middleware.ts";
import { ensureSettingsStorage } from "./settings.ts";
import {
  parseCourtCreate,
  parseCourtIdParam,
  parseCourtPatch,
  toCourtPayload,
  type CourtCreate,
  type CourtPatch,
  type CourtPayload,
} from "./settingsTypes.ts";

function errorStatus({ error }: { error: unknown }): { status: 400 | 403 | 404 | 409; body: Record<string, unknown> } {
  if (error instanceof ConflictError) return { status: 409, body: { error: error.message } };
  if (error instanceof ForbiddenError) return { status: 403, body: { error: error.message } };
  if (error instanceof NotFoundError) return { status: 404, body: { error: error.message } };
  if (error instanceof ValidationError) return { status: 400, body: { error: error.message } };
  throw error;
}

function listCourts({ db, venueId }: { db: DatabaseSync; venueId: VenueId }): CourtPayload[] {
  const rows = db
    .prepare("SELECT * FROM courts WHERE venue_id = ? ORDER BY sort_order ASC, id ASC")
    .all(venueId) as readonly unknown[];
  return rows.map((row) => toCourtPayload({ row }));
}

function loadCourt({
  db,
  venueId,
  courtId: id,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  courtId: CourtId;
}): CourtPayload {
  const row = db.prepare("SELECT * FROM courts WHERE id = ?").get(id);
  if (row === undefined) throw new NotFoundError({ message: `Court ${id} was not found.` });
  const court = toCourtPayload({ row });
  if (court.venueId !== venueId) {
    throw new ForbiddenError({ message: `${court.name} does not belong to this venue.` });
  }
  return court;
}

function insertCourt({
  db,
  venueId,
  input,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  input: CourtCreate;
}): CourtPayload {
  const clash = db.prepare("SELECT id FROM courts WHERE venue_id = ? AND name = ?").get(venueId, input.name);
  if (clash !== undefined) {
    throw new ConflictError({ message: `${input.name} already exists at this venue.` });
  }
  const orderRow = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS top FROM courts WHERE venue_id = ?")
    .get(venueId) as unknown;
  let top = 0;
  if (typeof orderRow === "object" && orderRow !== null && "top" in orderRow && typeof orderRow.top === "number") {
    top = orderRow.top;
  }
  const created = db
    .prepare("INSERT INTO courts (venue_id, name, hourly_rate_centavos, bookable, sort_order) VALUES (?, ?, ?, ?, ?)")
    .run(venueId, input.name, input.hourlyRateCentavos, input.bookable ? 1 : 0, top + 1);
  const row = db.prepare("SELECT * FROM courts WHERE id = ?").get(Number(created.lastInsertRowid));
  if (row === undefined) throw new NotFoundError({ message: "The new court could not be read back." });
  return toCourtPayload({ row });
}

function updateCourt({
  db,
  venueId,
  courtId: id,
  patch,
}: {
  db: DatabaseSync;
  venueId: VenueId;
  courtId: CourtId;
  patch: CourtPatch;
}): CourtPayload {
  const current = loadCourt({ db, venueId, courtId: id });
  if (patch.name !== undefined && patch.name !== current.name) {
    const clash = db
      .prepare("SELECT id FROM courts WHERE venue_id = ? AND name = ? AND id != ?")
      .get(venueId, patch.name, id);
    if (clash !== undefined) {
      throw new ConflictError({ message: `${patch.name} already exists at this venue.` });
    }
  }
  db.prepare("UPDATE courts SET name = ?, hourly_rate_centavos = ?, bookable = ? WHERE id = ?").run(
    patch.name ?? current.name,
    patch.hourlyRateCentavos ?? current.hourlyRateCentavos,
    (patch.bookable ?? current.bookable) ? 1 : 0,
    id,
  );
  return loadCourt({ db, venueId, courtId: id });
}

export function createCourtRoutes({ db }: { db: DatabaseSync }): Hono<AuthedContext> {
  ensureSettingsStorage({ db });
  const app = new Hono<AuthedContext>();
  const staffOnly = requireStaff({ db });
  const venueOnly = requireVenue({ db });

  app.get("/api/courts", staffOnly, venueOnly, (c) => {
    const { venueId } = readAuth({ c, db });
    try {
      return c.json(listCourts({ db, venueId }));
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/api/courts", staffOnly, venueOnly, requirePermission({ permission: "edit-rates" }), async (c) => {
    let body: unknown;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      return c.json({ errors: { body: "Expected a JSON object." } }, 400);
    }
    const parsed = parseCourtCreate({ value: body });
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
    const { venueId } = readAuth({ c, db });
    try {
      return c.json(insertCourt({ db, venueId, input: parsed.value }), 201);
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  app.patch("/api/courts/:id", staffOnly, venueOnly, requirePermission({ permission: "edit-rates" }), async (c) => {
    const idResult = parseCourtIdParam({ raw: c.req.param("id") });
    if (!idResult.ok) return c.json({ errors: idResult.errors }, 400);
    let body: unknown;
    try {
      body = unknownJson(await c.req.json());
    } catch {
      return c.json({ errors: { body: "Expected a JSON object." } }, 400);
    }
    const parsed = parseCourtPatch({ value: body });
    if (!parsed.ok) return c.json({ errors: parsed.errors }, 400);
    const { venueId } = readAuth({ c, db });
    try {
      return c.json(updateCourt({ db, venueId, courtId: idResult.value, patch: parsed.value }));
    } catch (error) {
      const mapped = errorStatus({ error });
      return c.json(mapped.body, mapped.status);
    }
  });

  return app;
}
