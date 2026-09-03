CREATE TABLE IF NOT EXISTS openplay_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  start_minute INTEGER NOT NULL,
  end_minute INTEGER NOT NULL,
  court_ids TEXT NOT NULL,
  level TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  fee_centavos INTEGER NOT NULL,
  registration_deadline TEXT NOT NULL DEFAULT 'At session start',
  instructions TEXT,
  created_by INTEGER NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_openplay_sessions_venue_date ON openplay_sessions (venue_id, date, start_minute);

CREATE TABLE IF NOT EXISTS openplay_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  session_id INTEGER NOT NULL REFERENCES openplay_sessions(id),
  player_name TEXT NOT NULL,
  mobile TEXT,
  slot TEXT NOT NULL DEFAULT 'roster',
  waitlist_position INTEGER,
  attendance TEXT,
  paid INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_openplay_registrations_session_slot ON openplay_registrations (session_id, slot, waitlist_position);
