import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { manilaNow, computeFee, getToday } from '../server/domain/venue.ts';
import { centavos } from '../shared/types.ts';

// Explicit local demo data only. Never runs on server startup.
const db = new DatabaseSync('pickleops.db');
db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000');
const venue = 'venue-qc-01';
const { date, nowMinute: now } = manilaNow({});
const marker = `demo-today:${date}`;
if (db.prepare('SELECT 1 FROM app_meta WHERE key = ?').get(marker)) {
  console.log(`Demo data already exists for ${date}; existing records were left intact.`);
  process.exit(0);
}
const courts = db.prepare('SELECT * FROM courts WHERE venue_id = ? AND bookable = 1 ORDER BY sort_order').all(venue);
const staff = db.prepare('SELECT staff_id FROM staff_venues WHERE venue_id = ? ORDER BY staff_id LIMIT 1').get(venue);
if (courts.length < 6 || !staff) throw new Error('This demo needs six bookable courts and a staff member.');
if (now < 100 || now > 1190) throw new Error('Run this live demo seed between 1:40 AM and 7:50 PM Manila time.');
mkdirSync('.local-backups', { recursive: true });
const backup = `.local-backups/before-demo-${Date.now()}.db`;
db.prepare('VACUUM INTO ?').run(backup);
const timestamp = new Date().toISOString();
let bookingCount = 0;
const names = ['Miguel Santos', 'Isabella Cruz', 'Rafael & friends', 'Camille Dela Rosa', 'Andrea Villanueva-Santiago', 'Paolo Reyes', 'Bea Mendoza', 'Nico Tan'];
const insertBooking = db.prepare(`INSERT INTO bookings (id,venue_id,court_id,customer_name,mobile,source,date,start_minute,duration_minutes,players,notes,status,payment_status,total_centavos,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
function booking(key, court, day, start, duration, name, status = 'Reserved', payment = 'Verified', players = 4) {
  const prefix = `RP-${day.slice(2).replaceAll('-','')}-`;
  const last = db.prepare('SELECT id FROM bookings WHERE id LIKE ? ORDER BY id DESC LIMIT 1').get(`${prefix}%`);
  const sequence = last ? Number(last.id.slice(-3)) + 1 : 1;
  if (sequence > 999) throw new Error('Daily booking sequence exhausted.');
  const id = prefix + String(sequence).padStart(3, '0');
  const clash = db.prepare("SELECT id FROM bookings WHERE venue_id=? AND court_id=? AND date=? AND status NOT IN ('Cancelled','No-show') AND start_minute < ? AND start_minute+duration_minutes > ?").get(venue,court.id,day,start+duration,start);
  const openClash = db.prepare('SELECT court_ids FROM openplay_sessions WHERE venue_id=? AND date=? AND start_minute < ? AND end_minute > ?').all(venue,day,start+duration,start).some(s => JSON.parse(s.court_ids).includes(court.id));
  if (clash || openClash) throw new Error(`Existing activity conflicts with demo ${key}; nothing was changed.`);
  const fee = computeFee({ hourlyRate: centavos(court.hourly_rate_centavos), durationMinutes: duration, overtimeMinutes: 0 });
  insertBooking.run(id,venue,court.id,name,null,['Messenger','Viber','Phone','Walk-in'][bookingCount%4],day,start,duration,players,'Demo data · fictional customer',status,payment,fee,staff.staff_id,timestamp);
  bookingCount++;
  if (status === 'In play' || status === 'Completed') db.prepare('INSERT INTO court_sessions (venue_id,booking_id,court_id,scheduled_end_minute,started_minute,ended_minute) VALUES (?,?,?,?,?,?)').run(venue,id,court.id,start+duration,start,status === 'Completed' ? start+duration : null);
  if (payment !== 'Awaiting payment') db.prepare(`INSERT INTO payments (venue_id,kind,ref_id,expected_centavos,submitted_centavos,method,txn_reference,payer_name,status,verified_by,verified_at,staff_note,submitted_by,created_at) VALUES (?,'booking',?,?,?,?,?,?,?,?,?,?,?,?)`).run(venue,id,fee,fee,['GCash','Maya','Cash','Bank transfer'][bookingCount%4],`DEMO-${key}`,name,payment,payment==='Verified'?staff.staff_id:null,payment==='Verified'?timestamp:null,'Demo payment',staff.staff_id,`${day}T04:00:00.000Z`);
  return id;
}
db.exec('BEGIN IMMEDIATE');
try {
  booking('playing',courts[0],date,now-25,90,names[0],'In play');
  booking('arriving',courts[1],date,now+25,90,names[1],'Reserved','In review');
  booking('overtime',courts[2],date,now-72,60,names[2],'In play');
  booking('later',courts[3],date,now+100,60,names[3],'Reserved','Awaiting payment');
  booking('long-name',courts[5],date,now-15,90,names[4],'In play','Verified',6);
  booking('next',courts[0],date,now+80,60,names[5]);
  for(let dayIndex=1; dayIndex<=7; dayIndex++) {
    const day = new Date(`${date}T12:00:00+08:00`); day.setUTCDate(day.getUTCDate()-dayIndex);
    const dayString = day.toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
    for(let i=0;i<3;i++) booking(`history-${dayIndex}-${i}`,courts[(dayIndex+i)%6],dayString,480+i*120,60,names[(dayIndex+i)%names.length],i===2&&dayIndex%3===0?'Cancelled':'Completed',i===2&&dayIndex%3===0?'Awaiting payment':'Verified');
  }
  const opCourt = courts[4];
  const conflicts = db.prepare("SELECT 1 FROM bookings WHERE venue_id=? AND court_id=? AND date=? AND status NOT IN ('Cancelled','No-show') AND start_minute < ? AND start_minute+duration_minutes > ?").get(venue,opCourt.id,date,now+150,now+30);
  const sharedConflict = db.prepare('SELECT court_ids FROM openplay_sessions WHERE venue_id=? AND date=? AND start_minute < ? AND end_minute > ?').all(venue,date,now+150,now+30).some(s => JSON.parse(s.court_ids).includes(opCourt.id));
  if(conflicts || sharedConflict) throw new Error('Open Play demo conflicts with existing court activity.');
  const op = db.prepare(`INSERT INTO openplay_sessions (venue_id,name,date,start_minute,end_minute,court_ids,level,capacity,fee_centavos,registration_deadline,instructions,created_by,created_at) VALUES (?,?,?,?,?,?,'All levels',8,25000,'At session start',?,?,?)`).run(venue,'Saturday Social · Mixed doubles',date,now+30,now+150,JSON.stringify([opCourt.id]),'Demo session · Rotate partners every game. Paddles available at reception.',staff.staff_id,timestamp);
  const roster = [...names,'Sofia Lim','Gabriel Flores'];
  roster.forEach((name,i) => db.prepare('INSERT INTO openplay_registrations (venue_id,session_id,player_name,slot,waitlist_position,attendance,paid,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(venue,Number(op.lastInsertRowid),name,i<8?'roster':'waitlist',i<8?null:i-7,null,i<6?1:0,staff.staff_id,timestamp));
  db.prepare('INSERT INTO app_meta (key,value) VALUES (?,?)').run(marker,JSON.stringify({ seededAt: timestamp, backup, bookingCount, openPlaySessionId:Number(op.lastInsertRowid) }));
  getToday({ db, venueId: venue, date, nowMinute: now });
  db.exec('COMMIT');
  console.log(JSON.stringify({date,nowMinute:now,bookingCount,openPlaySessions:1,registrations:10,backup}));
} catch(error) { db.exec('ROLLBACK'); throw error; }
