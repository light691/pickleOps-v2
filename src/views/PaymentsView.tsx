import { useEffect, useState } from "react";
import { Check, CurrencyCircleDollar } from "@phosphor-icons/react";
import {
  decidePayment,
  displayPaymentStatus,
  formatCentavos,
  listPayments,
  pillKind,
  submitPayment,
  type NewPaymentRequest,
  type PaymentItem,
  type PaymentKind,
  type PaymentMethod,
} from "./paymentsApi.ts";
import "./payments.css";

const FILTERS = ["Review", "Verified", "Rejected"] as const;

type QueueFilter = (typeof FILTERS)[number];

const METHODS: readonly PaymentMethod[] = ["GCash", "Maya", "Bank transfer", "Cash"];

const KINDS: readonly PaymentKind[] = ["booking", "openplay"];

function initials({ name }: { name: string }): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function pesosToCentavos({ value }: { value: string }): number | null {
  if (value.trim().length === 0) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function parseMethodValue({ value }: { value: string }): PaymentMethod {
  if (value === "Maya" || value === "Bank transfer" || value === "Cash") return value;
  return "GCash";
}

function StatusPill({ item }: { item: PaymentItem }) {
  return <span className={`pill ${pillKind({ status: item.status })}`}>{displayPaymentStatus({ status: item.status })}</span>;
}

export function PaymentsView() {
  const [filter, setFilter] = useState<QueueFilter>("Review");
  const [items, setItems] = useState<readonly PaymentItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staffNote, setStaffNote] = useState("");
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<PaymentKind>("booking");
  const [refId, setRefId] = useState("");
  const [expected, setExpected] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("GCash");
  const [txnReference, setTxnReference] = useState("");
  const [payerName, setPayerName] = useState("");
  const [receipt, setReceipt] = useState("");
  const [saving, setSaving] = useState(false);

  async function load({ queue }: { queue: QueueFilter }): Promise<void> {
    try {
      const rows = await listPayments({ status: queue });
      setItems(rows);
      setSelectedId((current) => {
        if (current !== null && rows.some((row) => row.id === current)) return current;
        const first = rows[0];
        return first === undefined ? null : first.id;
      });
      setError(null);
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load payments.");
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load({ queue: filter });
  }, [filter]);

  async function decide({
    verdict,
    note,
  }: {
    verdict: "Verified" | "Rejected";
    note: string | null;
  }): Promise<void> {
    if (selectedId === null) return;
    setActing(true);
    setNotice(null);
    try {
      const updated = await decidePayment({ id: selectedId, verdict, staffNote: note });
      setItems((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      setStaffNote("");
      setNotice(
        verdict === "Verified"
          ? `${updated.payerName}’s payment was verified by staff.`
          : `${updated.payerName}’s payment was sent back for review.`,
      );
    } catch (decideError) {
      setError(decideError instanceof Error ? decideError.message : "Could not save the verdict.");
    } finally {
      setActing(false);
    }
  }

  async function saveSubmission({ event }: { event: React.FormEvent }): Promise<void> {
    event.preventDefault();
    const expectedCentavos = pesosToCentavos({ value: expected });
    const submittedCentavos = pesosToCentavos({ value: submitted });
    if (expectedCentavos === null || submittedCentavos === null || refId.trim().length === 0) {
      setError("Enter the reference plus expected and submitted peso amounts.");
      return;
    }
    if (txnReference.trim().length === 0 || payerName.trim().length === 0) {
      setError("Enter the transaction reference and payer name.");
      return;
    }
    const input: NewPaymentRequest = {
      kind,
      refId: refId.trim(),
      expectedCentavos,
      submittedCentavos,
      method,
      txnReference: txnReference.trim(),
      payerName: payerName.trim(),
      receipt: receipt.trim().length === 0 ? null : receipt.trim(),
    };
    setSaving(true);
    try {
      const created = await submitPayment({ input });
      setFormOpen(false);
      setRefId("");
      setExpected("");
      setSubmitted("");
      setTxnReference("");
      setPayerName("");
      setReceipt("");
      setFilter("Review");
      setItems((rows) => [created, ...rows]);
      setSelectedId(created.id);
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the submission.");
    } finally {
      setSaving(false);
    }
  }

  const selected = items.find((row) => row.id === selectedId) ?? null;
  const pending = items.filter((row) => row.status === "In review").length;

  return (
    <section className="page-panel payments-page">
      <div className="page-title">
        <div>
          <h1>Payment verification</h1>
          <p>{notice ?? (loaded ? `${pending} submission${pending === 1 ? "" : "s"} need${pending === 1 ? "s" : ""} staff review.` : "Loading the review queue…")}</p>
        </div>
        <div className="queue-filter" aria-label="Payment queue">
          {FILTERS.map((entry) => (
            <button key={entry} className={filter === entry ? "active" : ""} aria-pressed={filter === entry} onClick={() => setFilter(entry)}>
              {entry}
            </button>
          ))}
        </div>
      </div>
      {error !== null && <p className="payments-error">{error}</p>}
      <div className="payments-layout">
        <div className="payment-list" role="region" aria-label="Payment submissions" tabIndex={0}>
          {items.map((item) => (
            <button className={item.id === selectedId ? "selected" : ""} key={item.id} onClick={() => setSelectedId(item.id)}>
              <div className="avatar coral">{initials({ name: item.payerName })}</div>
              <div>
                <strong>{item.payerName}</strong>
                <span>
                  {item.method ?? "Method not recorded"} · {formatCentavos({ value: item.submittedCentavos })}
                </span>
              </div>
              <StatusPill item={item} />
            </button>
          ))}
          {loaded && items.length === 0 && <p className="payments-empty">Nothing in this queue.</p>}
        </div>
        <div className="payment-detail">
          {selected === null && <p className="payments-empty">Pick a submission to review its receipt.</p>}
          {selected !== null && (
            <>
              <div className="payment-detail-scroll" role="region" aria-label="Payment details" tabIndex={0}>
              <div className="receipt">
                <CurrencyCircleDollar size={36} />
                <strong>{selected.method ?? "Unrecorded method"} payment receipt</strong>
                <span>{selected.receipt ?? "No receipt note attached"}</span>
              </div>
              <div className="detail-grid">
                <span>
                  Expected<strong>{formatCentavos({ value: selected.expectedCentavos })}</strong>
                </span>
                <span>
                  Submitted<strong>{formatCentavos({ value: selected.submittedCentavos })}</strong>
                </span>
                <span>
                  Payer<strong>{selected.payerName}</strong>
                </span>
                <span>
                  Reference<strong>{selected.txnReference ?? "None recorded"}</strong>
                </span>
                <span>
                  Kind<strong>{selected.kind === "booking" ? `Booking ${selected.refId}` : `Open Play ${selected.refId}`}</strong>
                </span>
                <span>
                  Status<strong>{displayPaymentStatus({ status: selected.status })}</strong>
                </span>
              </div>
              <div className="payments-history">
                <h2>History</h2>
                {selected.history.map((entry, index) => (
                  <div className="history-row" key={`${entry.stage}-${index}`}>
                    <span className={`history-dot ${entry.stage === "Verified" ? "mint" : entry.stage === "Rejected" ? "gold" : "pink"}`} />
                    <div>
                      <strong>{entry.stage}</strong>
                      <small>
                        {[entry.by, entry.at ? new Date(entry.at).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null].filter((part) => part !== null).join(" · ")}
                      </small>
                      {entry.note !== null && <small>{entry.note}</small>}
                    </div>
                  </div>
                ))}
              </div>
              <label>
                Staff notes
                <textarea
                  placeholder="Add verification notes..."
                  value={staffNote}
                  onChange={(event) => setStaffNote(event.target.value)}
                  disabled={selected.status !== "In review" || acting}
                />
              </label>
              </div>
              <div className="payment-actions">
                <button
                  className="secondary-button"
                  disabled={selected.status !== "In review" || acting}
                  onClick={() => void decide({ verdict: "Rejected", note: `Please upload a clearer receipt photo.${staffNote.trim().length === 0 ? "" : ` ${staffNote.trim()}`}` })}
                >
                  Request clearer copy
                </button>
                <button
                  className="secondary-button"
                  disabled={selected.status !== "In review" || acting}
                  onClick={() => void decide({ verdict: "Rejected", note: staffNote.trim().length === 0 ? null : staffNote.trim() })}
                >
                  Reject
                </button>
                <button
                  className="primary-button"
                  onClick={() => void decide({ verdict: "Verified", note: staffNote.trim().length === 0 ? null : staffNote.trim() })}
                  disabled={selected.status !== "In review" || acting}
                >
                  <Check size={16} /> {selected.status === "Verified" ? `Verified${selected.verifiedBy === null ? "" : " by staff"}` : "Verify by staff"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="payment-form-wrap">
        <button className="secondary-button" onClick={() => setFormOpen((value) => !value)}>
          {formOpen ? "Close manual submission" : "Record manual submission"}
        </button>
        {formOpen && (
          <form className="payment-form" onSubmit={(event) => void saveSubmission({ event })}>
            <div className="field-row">
              <label>
                Kind
                <select value={kind} onChange={(event) => setKind(event.target.value === "openplay" ? "openplay" : "booking")}>
                  {KINDS.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry === "booking" ? "Court booking" : "Open Play"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Booking / session ref
                <input placeholder="RP-260904-001" value={refId} onChange={(event) => setRefId(event.target.value)} />
              </label>
            </div>
            <div className="field-row">
              <label>
                Expected ₱
                <input inputMode="decimal" placeholder="650.00" value={expected} onChange={(event) => setExpected(event.target.value)} />
              </label>
              <label>
                Submitted ₱
                <input inputMode="decimal" placeholder="650.00" value={submitted} onChange={(event) => setSubmitted(event.target.value)} />
              </label>
            </div>
            <div className="field-row">
              <label>
                Method
                <select value={method} onChange={(event) => setMethod(parseMethodValue({ value: event.target.value }))}>
                  {METHODS.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Transaction reference
                <input placeholder="8472 0051 9032" value={txnReference} onChange={(event) => setTxnReference(event.target.value)} />
              </label>
            </div>
            <div className="field-row">
              <label>
                Payer name
                <input placeholder="ANA M CRUZ" value={payerName} onChange={(event) => setPayerName(event.target.value)} />
              </label>
              <label>
                Receipt note
                <input placeholder="GCash screenshot, 1:06 PM" value={receipt} onChange={(event) => setReceipt(event.target.value)} />
              </label>
            </div>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Submit for review"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
