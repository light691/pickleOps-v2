CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  expected_centavos INTEGER NOT NULL,
  submitted_centavos INTEGER NOT NULL,
  method TEXT,
  txn_reference TEXT,
  payer_name TEXT NOT NULL,
  receipt TEXT,
  status TEXT NOT NULL DEFAULT 'In review',
  verified_by INTEGER REFERENCES staff(id),
  verified_at TEXT,
  staff_note TEXT,
  submitted_by INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_venue_status ON payments (venue_id, status, id);
