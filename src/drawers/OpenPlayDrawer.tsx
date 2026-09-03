import { useEffect, useState } from "react";
import { Check, X } from "@phosphor-icons/react";
import { OPENPLAY_LEVELS, REGISTRATION_DEADLINES } from "../../server/routes/openplayTypes.ts";
import type {
  OpenPlayLevel,
  OpenPlaySession,
  RegistrationDeadline,
} from "../../server/routes/openplayTypes.ts";
import { ApiError, fetchToday } from "../api.ts";
import {
  createOpenPlaySession,
  updateOpenPlaySession,
  type OpenPlaySessionForm,
} from "../views/openplayApi.ts";
import "../views/openplay.css";

const DURATIONS = [60, 90, 120, 180] as const;

function isDuration(value: number): value is (typeof DURATIONS)[number] {
  return DURATIONS.some((candidate) => candidate === value);
}

function toTimeInput({ minute }: { minute: number }): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function toMinutes({ value }: { value: string }): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match === null || match[1] === undefined || match[2] === undefined) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isSafeInteger(hours) || !Number.isSafeInteger(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function toCentavos({ pesos }: { pesos: string }): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(pesos.trim())) return null;
  return Math.round(Number(pesos.trim()) * 100);
}

function durationLabel({ minutes }: { minutes: number }): string {
  if (minutes === 60) return "1 hour";
  if (minutes === 90) return "1.5 hours";
  if (minutes === 120) return "2 hours";
  return "3 hours";
}

interface CourtOption {
  readonly id: number;
  readonly name: string;
}

export function OpenPlayDrawer({
  open,
  session,
  onClose,
  onSaved,
}: {
  open: boolean;
  session: OpenPlaySession | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = session !== null;
  const [courts, setCourts] = useState<readonly CourtOption[]>([]);
  const [name, setName] = useState(session?.name ?? "");
  const [date, setDate] = useState<string>((session?.date as string | undefined) ?? "2026-09-04");
  const [start, setStart] = useState(toTimeInput({ minute: (session?.startMinute as number | undefined) ?? 1080 }));
  const [duration, setDuration] = useState<number>(() => {
    if (session === null) return 120;
    const span = (session.endMinute as number) - (session.startMinute as number);
    return isDuration(span) ? span : 120;
  });
  const [courtIds, setCourtIds] = useState<readonly number[]>(
    session === null ? [] : [...(session.courtIds as readonly number[])],
  );
  const [level, setLevel] = useState<OpenPlayLevel>(session?.level ?? "All levels");
  const [capacity, setCapacity] = useState(session?.capacity ?? 12);
  const [fee, setFee] = useState(
    session === null ? "250" : String(((session.feeCentavos as number) / 100).toFixed(0)),
  );
  const [deadline, setDeadline] = useState<RegistrationDeadline>(session?.deadline ?? "At session start");
  const [instructions, setInstructions] = useState(session?.instructions ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchToday()
      .then((today) => {
        if (cancelled) return;
        const options = today.courts.map((card) => ({ id: card.courtId as number, name: card.court }));
        setCourts(options);
        if (session === null && courtIds.length === 0 && options[0] !== undefined) {
          setCourtIds([options[0].id]);
        }
      })
      .catch(() => {
        if (!cancelled) setCourts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  function toggleCourt({ id }: { id: number }): void {
    setCourtIds(
      courtIds.includes(id) ? courtIds.filter((candidate) => candidate !== id) : [...courtIds, id].sort((a, b) => a - b),
    );
  }

  async function submit({ event }: { event: React.FormEvent }): Promise<void> {
    event.preventDefault();
    const startMinute = toMinutes({ value: start });
    const feeCentavos = toCentavos({ pesos: fee });
    if (name.trim().length === 0 || startMinute === null || feeCentavos === null || courtIds.length === 0) {
      setFormError("Enter a session name, start time, fee, and at least one court.");
      return;
    }
    if (!isDuration(duration)) {
      setFormError("Pick a session duration.");
      return;
    }
    const input: OpenPlaySessionForm = {
      name: name.trim(),
      date,
      startMinute,
      endMinute: startMinute + duration,
      courtIds: [...courtIds],
      level,
      capacity,
      feeCentavos,
      deadline,
      instructions: instructions.trim().length > 0 ? instructions.trim() : null,
    };
    setSaving(true);
    setFormError(null);
    try {
      const saved =
        session === null
          ? await createOpenPlaySession({ input })
          : await updateOpenPlaySession({ id: session.id as number, input });
      setSavedName(saved.name);
      onSaved();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Could not save the session. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <span>{editing ? "OPEN PLAY SESSION" : "NEW OPEN PLAY"}</span>
            <h2>{editing ? "Manage session" : "Create shared session"}</h2>
          </div>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {savedName !== null ? (
          <div className="success-state">
            <span>
              <Check size={28} weight="bold" />
            </span>
            <h2>{editing ? "Session updated" : "Open Play created"}</h2>
            <p>{editing ? `${savedName} has been updated.` : "The session is ready to accept player registrations."}</p>
            <button className="primary-button" onClick={onClose}>
              Back to Open Play
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void submit({ event })}>
            {formError !== null && (
              <p className="clash-banner" role="alert">
                {formError}
              </p>
            )}
            <label>
              Session name
              <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Friday Beginner Rally" />
            </label>
            <div className="field-row">
              <label>
                Date
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <label>
                Start time
                <input type="time" value={start} onChange={(event) => setStart(event.target.value)} />
              </label>
            </div>
            <div className="field-row">
              <label>
                Duration
                <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                  {DURATIONS.map((option) => (
                    <option key={option} value={option}>
                      {durationLabel({ minutes: option })}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Player level
                <select value={level} onChange={(event) => setLevel(event.target.value as OpenPlayLevel)}>
                  {OPENPLAY_LEVELS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="court-checks">
              <legend>Courts</legend>
              {courts.map((court) => (
                <label key={court.id}>
                  <input
                    type="checkbox"
                    checked={courtIds.includes(court.id)}
                    onChange={() => toggleCourt({ id: court.id })}
                  />
                  {court.name}
                </label>
              ))}
              {courts.length === 0 && <span>Sign in to load courts.</span>}
            </fieldset>
            <div className="field-row">
              <label>
                Capacity
                <input type="number" min={2} max={64} value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} />
              </label>
              <label>
                Fee per player (₱)
                <input value={fee} onChange={(event) => setFee(event.target.value)} inputMode="decimal" placeholder="250" />
              </label>
            </div>
            <div className="field-row">
              <label>
                Registration closes
                <select value={deadline} onChange={(event) => setDeadline(event.target.value as RegistrationDeadline)}>
                  {REGISTRATION_DEADLINES.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Notes
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Rotation format, equipment, or player instructions..."
              />
            </label>
            <div className="drawer-actions">
              <button type="button" className="secondary-button" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create Open Play"}
              </button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}
