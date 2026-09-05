import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { getToday } from './venue.ts';
import { manilaDate, minuteOfDay, venueId } from '../../shared/types.ts';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../openplaySchema.sql',import.meta.url),'utf8'));
  db.exec(`INSERT INTO organizations VALUES ('org','Demo');
    INSERT INTO venues VALUES ('venue','org','Demo',NULL,NULL,'Asia/Manila');
    INSERT INTO venue_settings (venue_id,timezone,currency,open_minute,close_minute) VALUES ('venue','Asia/Manila','PHP',480,1320);
    INSERT INTO staff (id,org_id,name,role,pin_salt,pin_hash) VALUES (1,'org','Demo','Manager','salt','hash');
    INSERT INTO courts VALUES (1,'venue','Court 1',65000,1,1);`);
  return db;
}
function today(db: DatabaseSync, minute: number) {
  return getToday({db,venueId:venueId('venue'),date:manilaDate('2026-09-05'),nowMinute:minuteOfDay(minute)}).courts[0]!;
}
test('a running session never lists itself as the next booking', () => {
  const db=fixture();
  try {
    db.exec(`INSERT INTO bookings (id,venue_id,court_id,customer_name,source,date,start_minute,duration_minutes,players,status,payment_status,created_by,created_at)
      VALUES ('RP-260905-001','venue',1,'Current player','Walk-in','2026-09-05',840,60,4,'In play','Verified',1,'2026-09-05'),
      ('RP-260905-002','venue',1,'Next player','Phone','2026-09-05',930,60,4,'Reserved','Verified',1,'2026-09-05');
      INSERT INTO court_sessions (venue_id,booking_id,court_id,scheduled_end_minute,started_minute) VALUES ('venue','RP-260905-001',1,900,840);`);
    assert.equal(today(db,870).next,'30 min left · Next booking 3:30 PM');
    db.exec("DELETE FROM bookings WHERE id='RP-260905-002'");
    assert.equal(today(db,870).next,'30 min left');
    assert.equal(today(db,905).status,'Overtime');
  } finally { db.close(); }
});
test('Open Play moves from upcoming availability to soon, active, then available', () => {
  const db=fixture();
  try {
    db.exec(`INSERT INTO openplay_sessions (venue_id,name,date,start_minute,end_minute,court_ids,level,capacity,fee_centavos,created_by,created_at)
      VALUES ('venue','Social doubles','2026-09-05',930,1050,'[1]','All levels',8,25000,1,'2026-09-05');`);
    assert.equal(today(db,870).headline,'Open until 3:30 PM');
    assert.equal(today(db,905).status,'Open play soon');
    assert.equal(today(db,905).customer,'Social doubles');
    assert.equal(today(db,940).status,'Open play');
    assert.equal(today(db,940).action,'Manage open play');
    assert.equal(today(db,1050).status,'Available');
    assert.equal(today(db,1050).headline,'Open until 10:00 PM');
  } finally { db.close(); }
});
test('Open Play remains scoped to its venue and court', () => {
  const db=fixture();
  try {
    db.exec(`INSERT INTO venues VALUES ('other','org','Other venue',NULL,NULL,'Asia/Manila');
      INSERT INTO courts VALUES (2,'venue','Court 2',65000,1,2);
      INSERT INTO openplay_sessions (venue_id,name,date,start_minute,end_minute,court_ids,level,capacity,fee_centavos,created_by,created_at)
      VALUES ('other','Other venue','2026-09-05',900,1050,'[1]','All levels',8,25000,1,'2026-09-05'),
      ('venue','Other court','2026-09-05',900,1050,'[2]','All levels',8,25000,1,'2026-09-05');`);
    assert.equal(today(db,940).status,'Available');
  } finally { db.close(); }
});
