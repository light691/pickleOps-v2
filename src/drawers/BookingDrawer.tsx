import { useEffect, useState } from "react";
import { Check, X } from "@phosphor-icons/react";
import { ApiError, OverlapError, createBookingRequest, fetchToday, type CreateBookingRequest } from "../api.ts";
import type { BookingSource, ClashInfo } from "../../shared/types.ts";

const SOURCES: readonly BookingSource[] = ["Messenger", "Viber", "Phone", "Walk-in"];

function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

function inputToMinutes({ value }: { value: string }): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match === null || match[1] === undefined || match[2] === undefined) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isSafeInteger(hours) || !Number.isSafeInteger(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export interface DrawerCourt {
  readonly court?: string;
  readonly action?: string;
  readonly customer?: string;
}

interface CourtOption {
  readonly id: number;
  readonly name: string;
}

export function BookingDrawer({
  open,
  onClose,
  initialCourt,
}: {
  open: boolean;
  onClose: () => void;
  initialCourt: DrawerCourt | null;
}) {
  const [courts, setCourts] = useState<readonly CourtOption[]>([]);
  const [source, setSource] = useState<BookingSource>(initialCourt?.action === "Add walk-in" ? "Walk-in" : "Messenger");
  const [customer, setCustomer] = useState(initialCourt?.customer ?? "");
  const [mobile, setMobile] = useState("");
  const [date, setDate] = useState(manilaToday());
  const [start, setStart] = useState("14:00");
  const [duration, setDuration] = useState(60);
  const [courtId, setCourtId] = useState<number | null>(null);
  const [players, setPlayers] = useState(4);
  const [notes, setNotes] = useState("");
  const [clash, setClash] = useState<ClashInfo | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  const [confirmedTotal, setConfirmedTotal] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchToday()
      .then((today) => {
        if (cancelled) return;
        const options = today.courts.map((card) => ({ id: card.courtId as number, name: card.court }));
        setCourts(options);
        const match = options.find((option) => option.name === initialCourt?.court);
        setCourtId(match?.id ?? options[0]?.id ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setCourts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, initialCourt?.court]);

  if (!open) return null;

  async function submit({ event }: { event: React.FormEvent }): Promise<void> {
    event.preventDefault();
    const startMinute = inputToMinutes({ value: start });
    if (courtId === null || startMinute === null || customer.trim().length === 0) {
      setFormError("Pick a court, a start time, and a customer name.");
      return;
    }
    const input: CreateBookingRequest = {
      courtId,
      customerName: customer.trim(),
      mobile: mobile.trim().length > 0 ? mobile.trim() : null,
      source,
      date,
      startMinute,
      durationMinutes: duration,
      players,
      notes: notes.trim().length > 0 ? notes.trim() : null,
    };
    setSaving(true);
    setClash(null);
    setFormError(null);
    try {
      const booking = await createBookingRequest({ input });
      setConfirmedId(booking.id as string);
      setConfirmedTotal(booking.totalCentavos === null ? null : `₱${((booking.totalCentavos as number) / 100).toFixed(2)}`);
    } catch (error) {
      if (error instanceof OverlapError) {
        setClash(error.clash);
        setFormError(error.clash?.summary ?? error.message);
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError("Could not save the booking. Try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <span>NEW BOOKING</span>
            <h2>Reserve a court</h2>
          </div>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {confirmedId !== null ? (
          <div className="success-state">
            <span>
              <Check size={28} weight="bold" />
            </span>
            <h2>Booking confirmed</h2>
            <p>Booking {confirmedId} has been added to today’s schedule.</p>
            <button className="primary-button" onClick={onClose}>
              Back to operations
            </button>
          </div>
        ) : (
          <form onSubmit={(event) => void submit({ event })}>
            {formError !== null && (
              <p className="clash-banner" role="alert">
                {formError}
              </p>
            )}
            <div className="field-row">
              <label>
                Booking source
                <select value={source} onChange={(event) => setSource(event.target.value as BookingSource)}>
                  {SOURCES.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>
                Customer name
                <input required value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Enter full name" />
              </label>
            </div>
            <label>
              Mobile number
              <input value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="09XX XXX XXXX" />
            </label>
            <div className="field-row three">
              <label>
                Date
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <label>
                Start time
                <input type="time" value={start} onChange={(event) => setStart(event.target.value)} aria-invalid={clash !== null} className={clash !== null ? "clash-field" : undefined} />
              </label>
              <label>
                Duration
                <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                </select>
              </label>
            </div>
            <div className="field-row">
              <label>
                Court
                <select
                  value={courtId ?? ""}
                  onChange={(event) => {
                    setCourtId(Number(event.target.value));
                    setClash(null);
                  }}
                  aria-invalid={clash !== null}
                  className={clash !== null ? "clash-field" : undefined}
                >
                  {courts.map((court) => (
                    <option key={court.id} value={court.id}>
                      {court.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Players
                <input type="number" min="1" value={players} onChange={(event) => setPlayers(Number(event.target.value))} />
              </label>
            </div>
            <label>
              Notes
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Equipment, arrival, or payment notes..." />
            </label>
            <div className="price-summary">
              <div>
                <span>Court fee</span>
                <strong>{confirmedTotal ?? "Computed on confirm"}</strong>
              </div>
              <div>
                <span>Excess player fee</span>
                <strong>₱0.00</strong>
              </div>
              <div className="total">
                <span>Total</span>
                <strong>{confirmedTotal ?? "Computed on confirm"}</strong>
              </div>
            </div>
            <div className="drawer-actions">
              <button type="button" className="secondary-button" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={saving || courtId === null}>
                {saving ? "Confirming…" : "Confirm booking"}
              </button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}
