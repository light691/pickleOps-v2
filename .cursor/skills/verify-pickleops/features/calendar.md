# Calendar

Calendar shows one day of court blocks across court columns, and lets staff reschedule, transfer, or cancel a booking by selecting its block.

## Sub-features

- `calendar-grid` renders every court as a column of booking blocks for the chosen day.
- `calendar-reschedule` moves a booking to a new time, rejecting overlaps.
- `calendar-transfer` moves a booking to another court.
- `calendar-cancel` cancels a booking and frees the slot.

## How to get to it (user POV)

- Choose `Calendar` in the side nav.
- Step days with `Previous day` and `Next day`, or pick `Calendar date`.
- Choose a booking block to open the `Selected booking` panel.

## Driving it with drive.mjs

Preconditions:

- Instance healthy at `http://localhost:5174`.
- A booking exists on the target day.
- `doctor.mjs` reports the expected URL and git revision.
- The Calendar view has no sign-in form of its own. Every drive signs in on the Today view first within the same invocation, then navigates to Calendar.

- **Sign in.** Fill staff credentials on Today. Run `--do "goto|?view=Today" --do "fill|Staff name|Mia Villanueva" --do "fill|Staff PIN|1234" --do "click|button|Sign in"`.
- **Open the grid.** Go to the view. Run `--do "goto|?view=Calendar"`. Columns render per court with blocks.
- **Select a block.** Choose a booking block. Run `--do "click|button|<customer> on <court> at <range>"` using the exact aria label from a prior `aria` snapshot. A `Selected booking` panel appears. Note: `expect` matches visible text only, so presence of an aria-labeled block is asserted by clicking it or by snapshotting and reading the file, never by `expect`.
- **Reschedule.** Change the start time and save. The block moves. An overlapping time shows a `role=alert` banner and the block stays put.
- **Transfer.** Change the court and save. The block renders under the new court column.
- **Cancel.** Choose cancel in the detail panel. The block disappears and the slot accepts a new booking.
- **Proof.** Run `--do "shot|calendar.png" --do "aria|calendar.aria.txt"`. The artifacts show the final grid state.

## Gotchas

- Block buttons share text across days. Always drive with the full aria label from a fresh snapshot.
- Open Play sessions render as read-only blocks. Choosing one opens no edit panel.
- Date input needs `YYYY-MM-DD` text.
