import { useCallback, useEffect, useState } from "react";
import { Funnel, Plus } from "@phosphor-icons/react";
import { ApiError, OverlapError } from "../api.ts";
import { assertNever, bookingId, manilaDate, type ManilaDate } from "../../shared/types.ts";
import type { CalendarBlock, CalendarBlockState } from "../../server/routes/calendarTypes.ts";
import { fetchCalendar, patchBookingRequest } from "./calendarApi.ts";
import "./calendar.css";

const DAY_START = 480;
const DAY_END = 1320;
const FALLBACK_COURTS = ["Court 1", "Court 2", "Court 3", "Court 4", "Court 5", "Court 6"];

function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

function minutesToInput({ minute }: { minute: number }): string {
  const hours = Math.floor(minute / 60);
  const rest = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function inputToMinutes({ value }: { value: string }): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match === null || match[1] === undefined || match[2] === undefined) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isSafeInteger(hours) || !Number.isSafeInteger(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function hourLabel({ hour }: { hour: number }): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${suffix}`;
}

function blockLabel({ state }: { state: CalendarBlockState }): string {
  switch (state) {
    case "confirmed":
      return "Confirmed";
    case "playing":
      return "In play";
    case "held":
      return "Held";
    case "openplay":
      return "Shared session";
    default:
      return assertNever({ value: state });
  }
}

function formatBlockRange({ block }: { block: CalendarBlock }): string {
  return `${minutesToInput({ minute: block.startMinute as number })}–${minutesToInput({ minute: block.endMinute as number })}`;
}

function shiftDate({ date, delta }: { date: string; delta: number }): string {
  const parts = date.split("-");
  if (parts.length !== 3 || parts[0] === undefined || parts[1] === undefined || parts[2] === undefined) return date;
  const next = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  next.setUTCDate(next.getUTCDate() + delta);
  return next.toISOString().slice(0, 10);
}

interface CourtOption {
  readonly id: number;
  readonly name: string;
}

function courtOptions({ blocks }: { blocks: readonly CalendarBlock[] }): readonly CourtOption[] {
  const seen = new Map<string, number>();
  for (const block of blocks) {
    if (!seen.has(block.court)) seen.set(block.court, block.courtId as number);
  }
  FALLBACK_COURTS.forEach((name, index) => {
    if (!seen.has(name)) seen.set(name, index + 1);
  });
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map((entry) => ({ name: entry[0], id: entry[1] }));
}

export function CalendarView({ onNewBooking }: { onNewBooking: (slot: { court: string } | null) => void }) {
  const [date, setDate] = useState(manilaToday());
  const [blocks, setBlocks] = useState<readonly CalendarBlock[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState(date);
  const [editStart, setEditStart] = useState("10:00");
  const [editDuration, setEditDuration] = useState(60);
  const [editCourt, setEditCourt] = useState(FALLBACK_COURTS[0] ?? "Court 1");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async ({ day }: { day: string }): Promise<void> => {
    try {
      const dayValue: ManilaDate = manilaDate(day);
      const calendar = await fetchCalendar({ date: dayValue });
      setBlocks(calendar.blocks);
      setError(null);
      setSelectedId(null);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        setError("Sign in from Today to see the calendar.");
      } else {
        setError(loadError instanceof Error ? loadError.message : "Could not load the calendar.");
      }
      setBlocks([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load({ day: date });
  }, [date, load]);

  const courts = courtOptions({ blocks });
  const hours: number[] = [];
  for (let hour = DAY_START / 60; hour < DAY_END / 60; hour += 1) hours.push(hour);
  const selected = blocks.find((block) => block.kind === "booking" && (block.bookingId as string) === selectedId) ?? null;

  function openBlock({ block }: { block: CalendarBlock }): void {
    if (block.kind !== "booking" || block.bookingId === null) return;
    setSelectedId(block.bookingId as string);
    setEditDate(block.date as string);
    setEditStart(minutesToInput({ minute: block.startMinute as number }));
    setEditDuration(block.durationMinutes);
    setEditCourt(block.court);
    setError(null);
  }

  async function saveEdits(): Promise<void> {
    if (selected === null) return;
    const startMinute = inputToMinutes({ value: editStart });
    if (startMinute === null) {
      setError("Enter a valid start time.");
      return;
    }
    const courtOption = courts.find((option) => option.name === editCourt);
    if (courtOption === undefined) {
      setError("Pick a court for the transfer.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchBookingRequest({
        id: bookingId(selected.bookingId as string),
        input: {
          courtId: courtOption.id,
          date: editDate,
          startMinute,
          durationMinutes: editDuration,
        },
      });
      await load({ day: date });
    } catch (saveError) {
      if (saveError instanceof OverlapError) {
        setError(saveError.clash?.summary ?? saveError.message);
      } else {
        setError(saveError instanceof Error ? saveError.message : "Could not update the booking.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function cancelSelected(): Promise<void> {
    if (selected === null) return;
    setSaving(true);
    setError(null);
    try {
      await patchBookingRequest({ id: bookingId(selected.bookingId as string), input: { status: "Cancelled" } });
      await load({ day: date });
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Could not cancel the booking.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-panel calendar-page">
      <div className="page-title">
        <div>
          <h1>Court calendar</h1>
          <p>
            {date} · 8:00 AM–10:00 PM{loaded ? "" : " · Loading…"}
          </p>
        </div>
        <button className="primary-button" onClick={() => onNewBooking(null)}>
          <Plus size={17} /> New booking
        </button>
      </div>
      <div className="calendar-controls">
        <button onClick={() => setDate(manilaToday())}>Today</button>
        <button aria-label="Previous day" onClick={() => setDate(shiftDate({ date, delta: -1 }))}>
          ‹
        </button>
        <button aria-label="Next day" onClick={() => setDate(shiftDate({ date, delta: 1 }))}>
          ›
        </button>
        <span>{date}</span>
        <input aria-label="Calendar date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <button>
          <Funnel size={15} /> All courts
        </button>
      </div>
      {error !== null && (
        <p className="clash-banner" role="alert">
          {error}
        </p>
      )}
      <div className="schedule">
        <div className="schedule-head">
          <span></span>
          {courts.map((court) => (
            <strong key={court.name}>{court.name}</strong>
          ))}
        </div>
        <div className="schedule-body calendar-day-grid" style={{ gridTemplateColumns: `80px repeat(${courts.length}, 1fr)` }}>
          {hours.map((hour) => (
            <div className="time-label" key={hour}>
              {hourLabel({ hour })}
            </div>
          ))}
          {hours.flatMap((hour) =>
            courts.map((court) => (
              <button
                key={`${hour}-${court.name}`}
                aria-label={`Create booking on ${court.name} at ${hourLabel({ hour })}`}
                className="schedule-cell"
                onClick={() => onNewBooking({ court: court.name })}
              ></button>
            )),
          )}
          {blocks.map((block) => {
            const courtIndex = courts.findIndex((court) => court.name === block.court);
            if (courtIndex < 0) return null;
            const row = Math.max(0, Math.floor(((block.startMinute as number) - DAY_START) / 60));
            const span = Math.max(1, Math.round(block.durationMinutes / 60));
            return (
              <button
                key={block.kind === "booking" ? (block.bookingId as string) : `session-${block.sessionId as number}`}
                className={`booking-block ${block.state}${selectedId === (block.bookingId as string) ? " selected" : ""}`}
                style={{ gridColumn: courtIndex + 2, gridRow: `${row + 1} / span ${span}` }}
                onClick={() => openBlock({ block })}
                aria-label={`${block.customer} on ${block.court} at ${formatBlockRange({ block })}`}
                title={block.kind === "openplay" ? "Open Play session, managed under Open Play" : undefined}
              >
                <strong>{block.customer}</strong>
                <small>
                  {blockLabel({ state: block.state })} · {block.paymentHint}
                </small>
              </button>
            );
          })}
        </div>
      </div>
      {selected !== null && (
        <aside className="calendar-detail" aria-label="Selected booking">
          <div>
            <span>SELECTED BOOKING</span>
            <h2>{selected.customer}</h2>
            <p>
              {selected.court} · {formatBlockRange({ block: selected })} · {blockLabel({ state: selected.state })} ·{" "}
              {selected.paymentHint}
            </p>
          </div>
          <div className="calendar-edit-row">
            <label>
              Date
              <input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
            </label>
            <label>
              Start time
              <input type="time" value={editStart} onChange={(event) => setEditStart(event.target.value)} />
            </label>
            <label>
              Duration
              <select value={editDuration} onChange={(event) => setEditDuration(Number(event.target.value))}>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </label>
            <label>
              Court
              <select value={editCourt} onChange={(event) => setEditCourt(event.target.value)}>
                {courts.map((court) => (
                  <option key={court.name} value={court.name}>
                    {court.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="calendar-detail-actions">
            <button className="secondary-button" onClick={cancelSelected} disabled={saving}>
              Cancel booking
            </button>
            <button className="primary-button" onClick={() => void saveEdits()} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </aside>
      )}
    </section>
  );
}
