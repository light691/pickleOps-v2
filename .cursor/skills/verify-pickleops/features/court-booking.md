# Court booking

Court booking lets staff reserve an entire court for a customer from the Today board, rejects double bookings with the clash named, and keeps the booking visible on Today and Calendar.

## Sub-features

- `booking-walkin` creates a walk-in booking from a court card.
- `booking-clash` rejects an overlapping booking with the clash detail.
- `booking-persist` shows the created booking on Today and Calendar after reload.

## How to get to it (user POV)

- Choose the `Add walk-in` button on a court card on the Today view.
- Choose `Court booking` from the header `Create` menu.
- Choose an empty slot on the Calendar view.

## Driving it with drive.mjs

Preconditions:

- Instance healthy at `http://localhost:5174`.
- No booking for Court 1 on 2026-09-04 from 10:00 to 11:00.
- `doctor.mjs` reports the expected URL and git revision.

- **Sign in.** Fill staff credentials and submit. Run with `--do "goto|?view=Today" --do "fill|Staff name|Mia Villanueva" --do "fill|Staff PIN|1234" --do "click|button|Sign in"`. Court cards render with statuses.
- **Open the drawer.** Choose the first `Add walk-in` button. Run `--do "click|button|Add walk-in"`. A drawer with `Customer name` appears.
- **Fill and confirm.** Enter the customer and slot. Run `--do "fill|Customer name|Verify Guest" --do "fill|Date|2026-09-04" --do "fill|Start time|10:00" --do "select|Duration|1 hour" --do "select|Court|Court 1" --do "click|button|Confirm booking"`. A `Booking confirmed` success screen names the new reference number.
- **Back to the board.** Return to operations. Run `--do "click|button|Back to operations" --do "expect|Verify Guest"`. Closing the drawer remounts the board, which refetches. The court card names Verify Guest.
- **Prove clash.** Repeat the same slot for another customer. The drawer shows a `role=alert` banner naming Verify Guest and no second booking is created.
- **Proof.** Capture the board and a second view. Run `--do "shot|board.png" --do "aria|board.aria.txt" --do "goto|?view=Calendar" --do "shot|calendar.png"`. The artifacts show Verify Guest on both views.

## Gotchas

- The `Court` select carries numeric values. Choose by visible label (`Court 1`), never by value.
- Time inputs need 24-hour `HH:MM` text (`10:00`), not `10:00 AM`.
- A success banner alone is insufficient proof. Reopen the board and the calendar.
- Cancel the created booking during fixture cleanup, but retain the proof artifacts.
