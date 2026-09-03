CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  address TEXT,
  contact TEXT,
  timezone TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courts (
  id INTEGER PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  name TEXT NOT NULL,
  hourly_rate_centavos INTEGER NOT NULL,
  bookable INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL,
  UNIQUE (venue_id, name)
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_venues (
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  venue_id TEXT NOT NULL REFERENCES venues(id),
  PRIMARY KEY (staff_id, venue_id)
);

CREATE TABLE IF NOT EXISTS venue_settings (
  venue_id TEXT PRIMARY KEY REFERENCES venues(id),
  timezone TEXT NOT NULL,
  currency TEXT NOT NULL,
  open_minute INTEGER NOT NULL,
  close_minute INTEGER NOT NULL,
  default_payment_status TEXT NOT NULL DEFAULT 'Awaiting payment',
  hold_unpaid_minutes INTEGER NOT NULL DEFAULT 15,
  payment_details TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  court_id INTEGER NOT NULL REFERENCES courts(id),
  customer_name TEXT NOT NULL,
  mobile TEXT,
  source TEXT NOT NULL,
  date TEXT NOT NULL,
  start_minute INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  players INTEGER NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Reserved',
  payment_status TEXT NOT NULL DEFAULT 'Awaiting payment',
  total_centavos INTEGER,
  created_by INTEGER NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_venue_court_date ON bookings (venue_id, court_id, date, start_minute);

CREATE TABLE IF NOT EXISTS court_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
  court_id INTEGER NOT NULL REFERENCES courts(id),
  scheduled_end_minute INTEGER NOT NULL,
  started_minute INTEGER NOT NULL,
  ended_minute INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_venue_court ON court_sessions (venue_id, court_id);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
