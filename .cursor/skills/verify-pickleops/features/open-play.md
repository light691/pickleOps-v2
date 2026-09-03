# Open Play

Open Play lets staff run shared sessions with capacity, a roster, an ordered waitlist, promotion, attendance, and per-player paid flags that feed the payment queue.

## Sub-features

- `openplay-create` creates a session with level, capacity, courts, and fee.
- `openplay-register` adds players to the roster until full, then parks extras on the waitlist in order.
- `openplay-promote` moves the first waitlisted player to the roster.
- `openplay-paid` marks a player paid and creates an `In review` payment submission.

## How to get to it (user POV)

- Choose `Open Play` in the side nav.
- Choose `New Open Play` for the creation form.
- Choose a session row for the roster panel.
- Choose `Open Play session` from the header `Create` menu.

## Driving it with drive.mjs

Preconditions:

- Instance healthy at `http://localhost:5174`.
- A session with capacity 2 exists, or create one through the form.
- `doctor.mjs` reports the expected URL and git revision.

- **Open the list.** Go to the view. Run `--do "goto|?view=Open Play"`. Sessions render with capacity counts and status pills.
- **Fill to full.** Register two players through the roster walk-in form. Status flips to `Full`.
- **Waitlist.** Register a third player. They land waitlisted with position 1.
- **Promote.** Choose promote. The first waitlisted player moves to the roster.
- **Mark paid.** Mark a roster player paid. A submission for the session fee appears in the Payments queue under `In review`.
- **Proof.** Run `--do "shot|openplay.png" --do "aria|openplay.aria.txt"`, then open the Payments view and capture the queued submission. The artifacts show the roster, the waitlist order, and the queued payment.

## Gotchas

- Level select uses `Intermediate plus`, not `Intermediate+`.
- Fee is entered in pesos and stored as centavos. Assert the rendered peso value, not the stored integer.
- Paid flags never resolve money by themselves. The payment must appear in the verification queue.
